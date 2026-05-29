import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichDriverOnlineFromAccountPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { listActiveTripsForDriverProfile } from "@/lib/rides/ride-trip-server";

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

export type DriverPanelState = {
  driver: DriverProfileOnlineRow | null;
  trips: RideBookingRow[];
  canonical_user_id: string | null;
  session_user_id: string;
  auth_phone_set: boolean;
};

/** Single load for /conductor/viajes — same profile + trips, no split-brain between APIs. */
export async function loadDriverPanel(
  supabase: SupabaseClient,
  args: { sessionUserId: string; authPhone: string | null },
): Promise<DriverPanelState> {
  const accountOpts = { authPhone: args.authPhone };
  const resolved = await resolveDriverProfileForSession(supabase, args);
  const driver = resolved
    ? await enrichDriverOnlineFromAccountPool(supabase, resolved, accountOpts)
    : null;

  const rawTrips =
    driver?.is_active_driver && driver.user_id
      ? await listActiveTripsForDriverProfile(supabase, driver.user_id, accountOpts)
      : [];
  const trips = await verifyDriverPanelTrips(supabase, rawTrips);

  return {
    driver,
    trips,
    canonical_user_id: driver?.user_id ?? null,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
  };
}
