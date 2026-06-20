import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import {
  enrichDriverOnlineFromAccountPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import { getRideById, getRideByIdFresh, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";
import {
  dropActiveRowsWithCompletedTicket,
  normalizeRideTicketCode,
} from "@/lib/rides/ride-ghost-filter";
import {
  collapseDriverPanelTripsByTicket,
  resolveCanonicalRideByTicketForDriver,
} from "@/lib/rides/resolve-ride-by-ticket";
import { listActiveTripsForDriverProfile } from "@/lib/rides/ride-trip-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn, driverProfileUserIdVariants } from "@/lib/user-id-variants";

const DRIVER_ACTIVE_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);
const DRIVER_ACTIVE_STATUS_LIST = ["matched", "accepted", "arrived", "in_trip"] as const;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tripMatchesDriverPool(ride: RideBookingRow, pool: string[]): boolean {
  if (!ride.driver_id || pool.length === 0) return false;
  const driverNorm = String(ride.driver_id).trim().toLowerCase();
  const poolNorm = new Set(pool.map((id) => id.trim().toLowerCase()));
  return poolNorm.has(driverNorm) || pool.some((id) => isSameUserId(id, ride.driver_id!));
}

/** Finished tickets in the last 7 days — never show as active ghosts on poll. */
async function recentCompletedTicketsForDriver(
  supabase: SupabaseClient,
  driverUserIds: string[],
): Promise<string[]> {
  const ids = [
    ...new Set(driverUserIds.flatMap((uid) => idMatchVariantsForIn(uid))),
  ];
  if (ids.length === 0) return [];

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ride_bookings")
    .select("ticket_code")
    .in("driver_id", ids)
    .eq("status", "completed")
    .gte("updated_at", since)
    .not("ticket_code", "is", null);

  if (error) {
    console.error("[driver-panel] recentCompletedTicketsForDriver", error);
    return [];
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => normalizeRideTicketCode((row as { ticket_code: string }).ticket_code))
        .filter(Boolean),
    ),
  ];
}

/** Re-read each row by id so completed/cancelled trips never leak from stale list scans. */
async function verifyDriverPanelTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideByIdFresh(supabase, row.id);
      if (!fresh || !DRIVER_ACTIVE_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

/** Direct assignment lookup — bypasses list scan when profile pool resolution misses rows. */
async function fallbackTripsByDriverUserId(
  supabase: SupabaseClient,
  driverUserId: string,
): Promise<RideBookingRow[]> {
  const ids = idMatchVariantsForIn(driverUserId);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("driver_id", ids)
    .in("status", [...DRIVER_ACTIVE_STATUS_LIST])
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("[driver-panel] fallbackTripsByDriverUserId", error);
    return [];
  }
  return verifyDriverPanelTrips(supabase, (data ?? []) as RideBookingRow[]);
}

async function fallbackTripsByDriverUserIdWithRetry(
  supabase: SupabaseClient,
  driverUserId: string,
  opts?: { maxAttempts?: number },
): Promise<RideBookingRow[]> {
  const maxAttempts = Math.min(Math.max(opts?.maxAttempts ?? 3, 1), 4);
  for (let i = 0; i < maxAttempts; i++) {
    const rows = await fallbackTripsByDriverUserId(supabase, driverUserId);
    if (rows.length > 0) return rows;
    if (i < maxAttempts - 1) await sleepMs(400);
  }
  return [];
}

/** One fast read from recent events — avoids multi-second retry loops on Vercel. */
async function quickActiveTripFromRecentEvents(
  supabase: SupabaseClient,
  driverPool: string[],
): Promise<RideBookingRow[]> {
  if (driverPool.length === 0) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from("ride_events")
    .select("ride_id")
    .in("to_status", [...DRIVER_ACTIVE_STATUS_LIST])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[driver-panel] quickActiveTripFromRecentEvents", error);
    return [];
  }

  const seen = new Set<string>();
  for (const evt of events ?? []) {
    const rideId = String((evt as { ride_id: string }).ride_id ?? "").trim();
    if (!rideId || seen.has(rideId)) continue;
    seen.add(rideId);
    const row = await getRideById(supabase, rideId);
    if (!row || !DRIVER_ACTIVE_STATUSES.has(row.status)) continue;
    if (!tripMatchesDriverPool(row, driverPool)) continue;
    return [row];
  }
  return [];
}

/**
 * When ride_bookings list scans lag on replica, ride_events still has fresh lifecycle rows.
 */
async function fallbackTripsFromDriverEvents(
  supabase: SupabaseClient,
  driverPool: string[],
): Promise<RideBookingRow[]> {
  if (driverPool.length === 0) return [];

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from("ride_events")
    .select("ride_id, to_status, created_at")
    .in("to_status", [...DRIVER_ACTIVE_STATUS_LIST])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(48);

  if (error) {
    console.error("[driver-panel] fallbackTripsFromDriverEvents", error);
    return [];
  }

  const rideIds = [
    ...new Set(
      (events ?? [])
        .map((evt) => String((evt as { ride_id: string }).ride_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

  const out: RideBookingRow[] = [];
  const seen = new Set<string>();
  for (const rideId of rideIds.slice(0, 6)) {
    if (seen.has(rideId)) continue;
    seen.add(rideId);
    const fresh = await getRideByIdFresh(supabase, rideId, { attempts: 2, delayMs: 300 });
    if (!fresh || !DRIVER_ACTIVE_STATUSES.has(fresh.status)) continue;
    if (!tripMatchesDriverPool(fresh, driverPool)) continue;
    out.push(fresh);
  }

  return out;
}

export type DriverPanelState = {
  driver: DriverProfileOnlineRow | null;
  trips: RideBookingRow[];
  canonical_user_id: string | null;
  session_user_id: string;
  auth_phone_set: boolean;
  /** Tickets that already have a completed row — client must not show active ghosts. */
  hide_tickets: string[];
};

/** Deep-link ride_id / ticket — include when list scan misses but driver is assigned. */
async function mergeExplicitDriverRide(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    explicitRideId?: string | null;
    explicitTicketCode?: string | null;
  },
  verified: RideBookingRow[],
): Promise<RideBookingRow[]> {
  const ticketParam = String(args.explicitTicketCode ?? "").trim();
  if (ticketParam) {
    const canonical = await resolveCanonicalRideByTicketForDriver(
      supabase,
      args.sessionUserId,
      ticketParam,
      { authPhone: args.authPhone },
    );
    if (canonical?.id && DRIVER_ACTIVE_STATUSES.has(canonical.status)) {
      if (verified.some((row) => row.id === canonical.id)) return verified;
      const [fresh] = await verifyDriverPanelTrips(supabase, [canonical]);
      if (fresh) return [fresh, ...verified.filter((row) => row.id !== fresh.id)];
    }
  }

  const id = String(args.explicitRideId ?? "").trim();
  if (!id || verified.some((row) => row.id === id)) return verified;

  let ride = await getRideById(supabase, id);
  if (!ride?.driver_id) return verified;

  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, {
    authPhone: args.authPhone,
  });
  if (!pool.some((uid) => isSameUserId(uid, ride!.driver_id))) return verified;

  if (ride.ticket_code) {
    const canonical = await resolveCanonicalRideByTicketForDriver(
      supabase,
      args.sessionUserId,
      ride.ticket_code,
      { authPhone: args.authPhone },
    );
    if (canonical) ride = canonical;
  }

  if (!DRIVER_ACTIVE_STATUSES.has(ride.status)) return verified;

  const [fresh] = await verifyDriverPanelTrips(supabase, [ride]);
  if (!fresh) return verified;
  return [fresh, ...verified.filter((row) => row.id !== fresh.id)];
}

/** Single load for /conductor/viajes — same profile + trips, no split-brain between APIs. */
export async function loadDriverPanel(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    explicitRideId?: string | null;
    explicitTicketCode?: string | null;
  },
): Promise<DriverPanelState> {
  const accountOpts = { authPhone: args.authPhone };
  let resolved = await resolveDriverProfileForSession(supabase, args);

  if (!resolved && args.authPhone) {
    const phoneIds = await userIdsForAuthPhone(supabase, args.authPhone);
    for (const uid of phoneIds) {
      const profileIds = driverProfileUserIdVariants(uid);
      const { data } = await supabase
        .from("driver_profiles")
        .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
        .in("user_id", profileIds)
        .eq("is_active_driver", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        resolved = data as DriverProfileOnlineRow;
        break;
      }
    }
  }

  const driver = resolved
    ? await enrichDriverOnlineFromAccountPool(supabase, resolved, accountOpts)
    : null;

  const explicitTicket = String(args.explicitTicketCode ?? "").trim();
  const explicitRideId = String(args.explicitRideId ?? "").trim();
  const hasExplicitPin = Boolean(explicitTicket || explicitRideId);

  const driverPool: string[] = [];
  if (driver?.user_id) {
    driverPool.push(driver.user_id);
    driverPool.push(...(await expandUserAccountIdPool(supabase, driver.user_id, accountOpts)));
  }
  driverPool.push(...(await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts)));
  const uniqueDriverPool = [...new Set(driverPool.flatMap((id) => idMatchVariantsForIn(id)))];

  // Fast path: WhatsApp / URL ticket — avoid slow replica fallbacks that timeout on Vercel.
  let verified: RideBookingRow[] = hasExplicitPin
    ? await mergeExplicitDriverRide(supabase, args, [])
    : [];

  if (verified.length === 0) {
    const rawTrips =
      driver?.is_active_driver && driver.user_id
        ? await listActiveTripsForDriverProfile(supabase, driver.user_id, accountOpts)
        : [];
    verified = await verifyDriverPanelTrips(supabase, rawTrips);
  }

  if (verified.length === 0 && uniqueDriverPool.length > 0) {
    verified = await quickActiveTripFromRecentEvents(supabase, uniqueDriverPool);
  }

  if (verified.length === 0 && driver?.user_id) {
    verified = await fallbackTripsByDriverUserIdWithRetry(supabase, driver.user_id, {
      maxAttempts: hasExplicitPin ? 1 : 3,
    });
  }

  if (verified.length === 0 && args.authPhone) {
    const phoneIds = await userIdsForAuthPhone(supabase, args.authPhone);
    for (const uid of phoneIds) {
      const byPhone = await fallbackTripsByDriverUserIdWithRetry(supabase, uid, { maxAttempts: 2 });
      if (byPhone.length > 0) {
        verified = byPhone;
        break;
      }
    }
  }

  if (verified.length === 0 && !hasExplicitPin && uniqueDriverPool.length > 0) {
    verified = await fallbackTripsFromDriverEvents(supabase, uniqueDriverPool);
  }

  let { trips, hideTickets } = await dropActiveRowsWithCompletedTicket(supabase, verified);
  trips = await collapseDriverPanelTripsByTicket(supabase, trips, {
    sessionUserId: driver?.user_id ?? args.sessionUserId,
    authPhone: args.authPhone,
  });
  trips = await verifyDriverPanelTrips(supabase, trips);
  if (!hasExplicitPin) {
    trips = await mergeExplicitDriverRide(supabase, args, trips);
  }

  const completedHide = await recentCompletedTicketsForDriver(supabase, uniqueDriverPool);
  const allHideTickets = [...new Set([...hideTickets, ...completedHide])];

  return {
    driver,
    trips,
    canonical_user_id: driver?.user_id ?? null,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
    hide_tickets: allHideTickets,
  };
}
