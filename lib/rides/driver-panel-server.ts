import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichDriverOnlineFromAccountPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { listActiveTripsForDriverProfile } from "@/lib/rides/ride-trip-server";

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

  const trips =
    driver?.is_active_driver && driver.user_id
      ? await listActiveTripsForDriverProfile(supabase, driver.user_id, accountOpts)
      : [];

  return {
    driver,
    trips,
    canonical_user_id: driver?.user_id ?? null,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
  };
}
