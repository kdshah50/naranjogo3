import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { loadDriverPanel } from "@/lib/rides/driver-panel-server";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { dropActiveRowsWithCompletedTicket } from "@/lib/rides/ride-ghost-filter";
import {
  latestBuyerRideForDisplay,
  listActiveTripsForBuyer,
} from "@/lib/rides/ride-trip-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

const BUYER_OPEN_STATUSES = new Set(["requested", "matched", "accepted", "arrived", "in_trip"]);
const DRIVER_PUBLIC_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip", "completed"]);

export type RideDriverPublic = {
  display_name: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_plates: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

export type RideSyncState = {
  /** Primary ride for rider UI — active, terminal (when ride_id set), or null. */
  ride: RideBookingRow | null;
  /** Driver panel trips (verified, ghost-filtered). */
  trips: RideBookingRow[];
  driver: Awaited<ReturnType<typeof loadDriverPanel>>["driver"];
  driver_public: RideDriverPublic | null;
  canonical_user_id: string | null;
  session_user_id: string;
  auth_phone_set: boolean;
  hide_tickets: string[];
  debug: {
    pool_size: number;
    drop_reason: string | null;
    source_ride_id: string | null;
    raw_buyer_count: number;
    verified_buyer_count: number;
  };
};

async function verifyBuyerOpenTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
      if (!fresh || !BUYER_OPEN_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

async function loadDriverPublic(
  supabase: SupabaseClient,
  driverUserId: string,
): Promise<RideDriverPublic | null> {
  const id = String(driverUserId ?? "").trim();
  if (!id) return null;

  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase
      .from("driver_profiles")
      .select(
        "vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_plates,last_lat,last_lng,last_location_at",
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase.from("users").select("display_name").eq("id", id).maybeSingle(),
  ]);

  if (!profile && !user?.display_name) return null;

  return {
    display_name: user?.display_name ?? null,
    vehicle_make: profile?.vehicle_make ?? null,
    vehicle_model: profile?.vehicle_model ?? null,
    vehicle_year: profile?.vehicle_year ?? null,
    vehicle_color: profile?.vehicle_color ?? null,
    vehicle_plates: profile?.vehicle_plates ?? null,
    last_lat: profile?.last_lat ?? null,
    last_lng: profile?.last_lng ?? null,
    last_location_at: profile?.last_location_at ?? null,
  };
}

async function resolveBuyerRide(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    rideId?: string | null;
  },
): Promise<{
  ride: RideBookingRow | null;
  dropReason: string | null;
  rawBuyerCount: number;
  verifiedBuyerCount: number;
}> {
  const accountOpts = { authPhone: args.authPhone };
  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts);

  const explicitId = String(args.rideId ?? "").trim();
  if (explicitId) {
    const ride = await getRideById(supabase, explicitId);
    if (ride && pool.some((uid) => isSameUserId(uid, ride.buyer_id))) {
      const fresh = await getRideById(supabase, explicitId);
      const resolved = fresh ?? ride;
      return {
        ride: BUYER_OPEN_STATUSES.has(resolved.status) ? resolved : null,
        dropReason: BUYER_OPEN_STATUSES.has(resolved.status)
          ? null
          : `verify:${resolved.status}`,
        rawBuyerCount: 1,
        verifiedBuyerCount: BUYER_OPEN_STATUSES.has(resolved.status) ? 1 : 0,
      };
    }
  }

  const buyerTripsRaw = await listActiveTripsForBuyer(
    supabase,
    args.sessionUserId,
    accountOpts,
  );
  const { trips: postGhost, hideTickets } = await dropActiveRowsWithCompletedTicket(
    supabase,
    buyerTripsRaw,
  );
  const verified = await verifyBuyerOpenTrips(supabase, postGhost);

  if (verified.length > 0) {
    return {
      ride: verified[0],
      dropReason: null,
      rawBuyerCount: buyerTripsRaw.length,
      verifiedBuyerCount: verified.length,
    };
  }

  let dropReason: string | null = null;
  if (buyerTripsRaw.length > 0 && postGhost.length === 0 && hideTickets.length > 0) {
    dropReason = `ghost:${hideTickets[0]}`;
  } else if (buyerTripsRaw.length > 0) {
    const row = postGhost[0] ?? buyerTripsRaw[0];
    const fresh = await getRideById(supabase, row.id);
    dropReason = `verify:${fresh?.status ?? "missing"}`;
  }

  const display = await latestBuyerRideForDisplay(
    supabase,
    args.sessionUserId,
    accountOpts,
  );
  if (display && !BUYER_OPEN_STATUSES.has(display.status)) {
    return {
      ride: null,
      dropReason,
      rawBuyerCount: buyerTripsRaw.length,
      verifiedBuyerCount: 0,
    };
  }

  return {
    ride: null,
    dropReason,
    rawBuyerCount: buyerTripsRaw.length,
    verifiedBuyerCount: 0,
  };
}

/** Single load for rider + driver UIs — server is always source of truth. */
export async function loadRideSyncState(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    rideId?: string | null;
  },
): Promise<RideSyncState> {
  const accountOpts = { authPhone: args.authPhone };
  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts);

  const [buyer, panel] = await Promise.all([
    resolveBuyerRide(supabase, args),
    loadDriverPanel(supabase, {
      sessionUserId: args.sessionUserId,
      authPhone: args.authPhone,
      explicitRideId: args.rideId,
    }),
  ]);

  let driverPublic: RideDriverPublic | null = null;
  const ride = buyer.ride;
  if (
    ride?.driver_id &&
    DRIVER_PUBLIC_STATUSES.has(ride.status)
  ) {
    driverPublic = await loadDriverPublic(supabase, ride.driver_id);
  }

  const hideTickets = [...new Set([...panel.hide_tickets])];

  return {
    ride,
    trips: panel.trips,
    driver: panel.driver,
    driver_public: driverPublic,
    canonical_user_id: panel.canonical_user_id,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
    hide_tickets: hideTickets,
    debug: {
      pool_size: pool.length,
      drop_reason: buyer.dropReason,
      source_ride_id: args.rideId ? String(args.rideId).slice(0, 8) : null,
      raw_buyer_count: buyer.rawBuyerCount,
      verified_buyer_count: buyer.verifiedBuyerCount,
    },
  };
}
