import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findActiveDriverProfileForAccount,
  findAnyDriverProfileForAccount,
  pickCanonicalDriverProfile,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";
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

  let driver = await findActiveDriverProfileForAccount(
    supabase,
    args.sessionUserId,
    accountOpts,
  );
  if (!driver) {
    driver = await findAnyDriverProfileForAccount(supabase, args.sessionUserId, accountOpts);
  }

  // Duplicate OTP users: always bind to the approved profile for this phone.
  if (args.authPhone && !driver?.is_active_driver) {
    const phoneIds = await userIdsForAuthPhone(supabase, args.authPhone);
    for (const pid of phoneIds) {
      const candidate = await pickCanonicalDriverProfile(supabase, pid, accountOpts);
      if (candidate?.is_active_driver) {
        driver = candidate;
        break;
      }
    }
  }

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
