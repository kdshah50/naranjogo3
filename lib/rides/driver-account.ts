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
  const profile = await pickCanonicalDriverProfile(supabase, userId, options);
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
async function queryActiveDriverProfiles(
  supabase: SupabaseClient,
  idPool: string[],
): Promise<DriverProfileOnlineRow[]> {
  if (idPool.length === 0) return [];

  const { data, error } = await supabase
    .from("driver_profiles")
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .in("user_id", idPool)
    .eq("is_active_driver", true)
    .order("updated_at", { ascending: false });

  if (error) {
    const missingOnline =
      error.code === "42703" ||
      String(error.message ?? "").includes("is_online") ||
      String(error.message ?? "").includes("last_lat");
    if (missingOnline) {
      const fallback = await supabase
        .from("driver_profiles")
        .select("user_id,is_active_driver")
        .in("user_id", idPool)
        .eq("is_active_driver", true)
        .order("updated_at", { ascending: false });
      if (fallback.error) {
        console.error("[driver-account] queryActiveDriverProfiles fallback", fallback.error);
        return [];
      }
      return (fallback.data ?? []).map((row) => ({
        user_id: String(row.user_id),
        is_active_driver: Boolean(row.is_active_driver),
        is_online: false,
        last_lat: null,
        last_lng: null,
        last_location_at: null,
      }));
    }
    console.error("[driver-account] queryActiveDriverProfiles", error);
    return [];
  }
  return (data ?? []) as DriverProfileOnlineRow[];
}

function isRideListingRow(row: {
  subcategory_kind: string | null;
  title_es: string | null;
  status?: string | null;
}): boolean {
  const status = String(row.status ?? "").toLowerCase();
  if (status === "deleted" || status === "archived") return false;
  return (
    row.subcategory_kind === "ride" ||
    (row.subcategory_kind == null &&
      typeof row.title_es === "string" &&
      /taxi|transporte|ride/i.test(row.title_es))
  );
}

/**
 * Same driver row dispatch uses: active profile that owns a verified ride listing.
 * Avoids picking the wrong duplicate-user profile (root cause of empty driver panel).
 */
export async function pickCanonicalDriverProfile(
  supabase: SupabaseClient,
  userId: string,
  options?: DriverAccountOptions,
): Promise<DriverProfileOnlineRow | null> {
  const idPool = await expandUserAccountIdPool(supabase, userId, options);
  const phoneIds = options?.authPhone
    ? await userIdsForAuthPhone(supabase, options.authPhone)
    : [];
  const searchPool = [...new Set([...idPool, ...phoneIds.flatMap((id) => idMatchVariantsForIn(id))])];

  let profiles = await queryActiveDriverProfiles(supabase, searchPool);
  if (profiles.length === 0 && phoneIds.length > 0) {
    profiles = await queryActiveDriverProfiles(supabase, phoneIds);
  }
  if (profiles.length === 0) return null;

  for (const profile of profiles) {
    const sellerPool = await expandUserAccountIdPool(supabase, profile.user_id, options);
    const { data: listings } = await supabase
      .from("listings")
      .select("id,subcategory_kind,title_es,is_verified,status")
      .in("seller_id", sellerPool)
      .eq("is_verified", true);

    if ((listings ?? []).some(isRideListingRow)) {
      return profile;
    }
  }

  const online = profiles.find((p) => p.is_online === true);
  return online ?? profiles[0];
}

async function queryActiveDriverProfile(
  supabase: SupabaseClient,
  idPool: string[],
): Promise<DriverProfileOnlineRow | null> {
  const rows = await queryActiveDriverProfiles(supabase, idPool);
  return rows[0] ?? null;
}

export async function findActiveDriverProfileForAccount(
  supabase: SupabaseClient,
  userId: string,
  options?: { authPhone?: string | null },
): Promise<DriverProfileOnlineRow | null> {
  const canonical = await pickCanonicalDriverProfile(supabase, userId, options);
  if (canonical) return canonical;

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
  const phoneIds = options?.authPhone
    ? await userIdsForAuthPhone(supabase, options.authPhone)
    : [];
  const searchPool = [...new Set([...idPool, ...phoneIds.flatMap((id) => idMatchVariantsForIn(id))])];
  if (searchPool.length === 0) return null;

  const { data, error } = await supabase
    .from("driver_profiles")
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .in("user_id", searchPool)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-account] findAnyDriverProfileForAccount", error);
    return null;
  }
  return (data as DriverProfileOnlineRow) ?? null;
}
