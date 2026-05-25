import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export type DriverProfileOnlineRow = {
  user_id: string;
  is_online: boolean;
  is_active_driver: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

/** Active driver profile for this login, including duplicate-user rows tied by phone. */
export async function findActiveDriverProfileForAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<DriverProfileOnlineRow | null> {
  const idPool = await expandUserAccountIdPool(supabase, userId);
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
    console.error("[driver-account] findActiveDriverProfileForAccount", error);
    return null;
  }
  return (data as DriverProfileOnlineRow) ?? null;
}

/** Any driver profile row for account pool (pending approval). */
export async function findAnyDriverProfileForAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<DriverProfileOnlineRow | null> {
  const idPool = await expandUserAccountIdPool(supabase, userId);
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
