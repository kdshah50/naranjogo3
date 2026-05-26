import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findActiveDriverProfileForAccount,
  findAnyDriverProfileForAccount,
  pickCanonicalDriverProfile,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";

/**
 * One driver profile row for this login — used by panel + online toggle (no split-brain).
 */
export async function resolveDriverProfileForSession(
  supabase: SupabaseClient,
  args: { sessionUserId: string; authPhone: string | null },
): Promise<DriverProfileOnlineRow | null> {
  const accountOpts = { authPhone: args.authPhone };

  if (args.authPhone) {
    const phoneIds = await userIdsForAuthPhone(supabase, args.authPhone);
    for (const pid of phoneIds) {
      const byPhone = await pickCanonicalDriverProfile(supabase, pid, accountOpts);
      if (byPhone?.is_active_driver) return byPhone;
    }
  }

  const active = await findActiveDriverProfileForAccount(
    supabase,
    args.sessionUserId,
    accountOpts,
  );
  if (active?.is_active_driver) return active;

  const any = await findAnyDriverProfileForAccount(supabase, args.sessionUserId, accountOpts);
  return any;
}
