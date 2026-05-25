import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type DriverProfileOnlineRow = {
  user_id: string;
  is_online: boolean;
  is_active_driver: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

export type DriverAccountOptions = { authPhone?: string | null };

/** Pool for ride assignment lookups — includes approved driver profile + duplicate phone rows. */
export async function driverRideAccountIdPool(
  supabase: SupabaseClient,
  userId: string,
  options?: DriverAccountOptions,
): Promise<string[]> {
  const profile = await findActiveDriverProfileForAccount(supabase, userId, options);
  const rootId = profile?.user_id ?? userId;
  const pool = new Set<string>(await expandUserAccountIdPool(supabase, rootId, options));

  if (profile?.user_id) {
    for (const v of idMatchVariantsForIn(String(profile.user_id))) pool.add(v);
  }
  if (options?.authPhone) {
    for (const id of await userIdsForAuthPhone(supabase, options.authPhone)) {
      for (const v of idMatchVariantsForIn(id)) pool.add(v);
    }
  }

  return [...pool].filter(Boolean);
}

/** Active driver profile for this login, including duplicate-user rows tied by phone. */
async function queryActiveDriverProfile(
  supabase: SupabaseClient,
  idPool: string[],
): Promise<DriverProfileOnlineRow | null> {
  if (idPool.length === 0) return null;

  const { data, error } = await supabase
    .from("driver_profiles")
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .in("user_id", idPool)
    .eq("is_active_driver", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-account] queryActiveDriverProfile", error);
    return null;
  }
  return (data as DriverProfileOnlineRow) ?? null;
}

export async function findActiveDriverProfileForAccount(
  supabase: SupabaseClient,
  userId: string,
  options?: { authPhone?: string | null },
): Promise<DriverProfileOnlineRow | null> {
  const idPool = await expandUserAccountIdPool(supabase, userId, options);
  const fromPool = await queryActiveDriverProfile(supabase, idPool);
  if (fromPool) return fromPool;

  if (!options?.authPhone) return null;

  const phoneIds = await userIdsForAuthPhone(supabase, options.authPhone);
  return queryActiveDriverProfile(supabase, phoneIds);
}

/** Any driver profile row for account pool (pending approval). */
export async function findAnyDriverProfileForAccount(
  supabase: SupabaseClient,
  userId: string,
  options?: { authPhone?: string | null },
): Promise<DriverProfileOnlineRow | null> {
  const idPool = await expandUserAccountIdPool(supabase, userId, options);
  if (idPool.length === 0) return null;

  const { data, error } = await supabase
    .from("driver_profiles")
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .in("user_id", idPool)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-account] findAnyDriverProfileForAccount", error);
    return null;
  }
  return (data as DriverProfileOnlineRow) ?? null;
}
