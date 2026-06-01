import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichDriverOnlineFromAccountPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";
import { dropActiveRowsWithCompletedTicket } from "@/lib/rides/ride-ghost-filter";
import { listActiveTripsForDriverProfile } from "@/lib/rides/ride-trip-server";
import { idMatchVariantsForIn, driverProfileUserIdVariants } from "@/lib/user-id-variants";

const DRIVER_ACTIVE_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);

/** Re-read each row by id so completed/cancelled trips never leak from stale list scans. */
async function verifyDriverPanelTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
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
    .in("status", ["matched", "accepted", "arrived", "in_trip"])
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    console.error("[driver-panel] fallbackTripsByDriverUserId", error);
    return [];
  }
  return verifyDriverPanelTrips(supabase, (data ?? []) as RideBookingRow[]);
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

/** Single load for /conductor/viajes — same profile + trips, no split-brain between APIs. */
export async function loadDriverPanel(
  supabase: SupabaseClient,
  args: { sessionUserId: string; authPhone: string | null },
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

  const rawTrips =
    driver?.is_active_driver && driver.user_id
      ? await listActiveTripsForDriverProfile(supabase, driver.user_id, accountOpts)
      : [];
  let verified = await verifyDriverPanelTrips(supabase, rawTrips);

  if (verified.length === 0 && driver?.user_id) {
    verified = await fallbackTripsByDriverUserId(supabase, driver.user_id);
  }

  if (verified.length === 0 && args.authPhone) {
    const phoneIds = await userIdsForAuthPhone(supabase, args.authPhone);
    for (const uid of phoneIds) {
      const byPhone = await fallbackTripsByDriverUserId(supabase, uid);
      if (byPhone.length > 0) {
        verified = byPhone;
        break;
      }
    }
  }

  const { trips, hideTickets } = await dropActiveRowsWithCompletedTicket(supabase, verified);

  return {
    driver,
    trips,
    canonical_user_id: driver?.user_id ?? null,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
    hide_tickets: hideTickets,
  };
}
