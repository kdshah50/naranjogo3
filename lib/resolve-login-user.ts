import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { phoneLookupVariants } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type LoginUserRow = {
  id: string;
  display_name: string | null;
  trust_badge: string;
};

function normalizeLoginPhone(phone: string): string {
  return canonicalizeAuthPhone(normalizeAuthPhone(phone));
}

/** All `users.id` values that share this phone (any stored format). */
export async function userIdsForAuthPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<string[]> {
  const variants = phoneLookupVariants(normalizeLoginPhone(phone));
  if (variants.length === 0) return [];

  const { data: users, error } = await supabase.from("users").select("id").in("phone", variants);
  if (error) {
    console.error("[resolve-login-user] userIdsForAuthPhone", error);
    return [];
  }

  const out = new Set<string>();
  for (const row of users ?? []) {
    for (const v of idMatchVariantsForIn(String(row.id))) out.add(v);
  }
  return [...out];
}

/**
 * When several `users` rows share one phone, prefer the row tied to an active driver profile
 * so JWT `sub` matches the approved conductor account.
 */
export async function pickLoginUserForPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<LoginUserRow | null> {
  const canonical = normalizeLoginPhone(phone);
  const variants = phoneLookupVariants(canonical);
  if (variants.length === 0) return null;

  const { data: users, error } = await supabase
    .from("users")
    .select("id, display_name, trust_badge, created_at")
    .in("phone", variants)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[resolve-login-user] pickLoginUserForPhone users", error);
    return null;
  }
  if (!users?.length) return null;
  if (users.length === 1) return users[0] as LoginUserRow;

  const idPool = users.flatMap((u) => idMatchVariantsForIn(String(u.id)));

  const { data: activeProfiles, error: pErr } = await supabase
    .from("driver_profiles")
    .select("user_id")
    .in("user_id", idPool)
    .eq("is_active_driver", true)
    .order("updated_at", { ascending: false });

  if (!pErr && activeProfiles?.length) {
    const targetId = String(activeProfiles[0].user_id);
    const match = users.find((u) => isSameUserId(String(u.id), targetId));
    if (match) return match as LoginUserRow;
  }

  const { data: anyProfiles, error: anyErr } = await supabase
    .from("driver_profiles")
    .select("user_id")
    .in("user_id", idPool)
    .order("created_at", { ascending: false });

  if (!anyErr && anyProfiles?.length) {
    const targetId = String(anyProfiles[0].user_id);
    const match = users.find((u) => isSameUserId(String(u.id), targetId));
    if (match) return match as LoginUserRow;
  }

  const { data: walletRows } = await supabase
    .from("wallets")
    .select("user_id")
    .in("user_id", idPool)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (walletRows?.length) {
    const targetId = String(walletRows[0].user_id);
    const match = users.find((u) => isSameUserId(String(u.id), targetId));
    if (match) return match as LoginUserRow;
  }

  return users[0] as LoginUserRow;
}

/** Normalize phone on every duplicate row after OTP login. */
export async function canonicalizeDuplicateUserPhones(
  supabase: SupabaseClient,
  phone: string,
): Promise<void> {
  const canonical = normalizeLoginPhone(phone);
  const ids = await userIdsForAuthPhone(supabase, canonical);
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("users")
    .update({ phone: canonical, phone_verified: true })
    .in("id", ids);

  if (error) {
    console.error("[resolve-login-user] canonicalizeDuplicateUserPhones", error);
  }
}

/**
 * Resolve login user without creating duplicate rows (Phase 0).
 * On insert race / unique violation, re-picks existing row by phone variants.
 */
export async function findOrInsertLoginUserForPhone(
  supabase: SupabaseClient,
  phone: string,
  options?: { referredBy?: string | null },
): Promise<LoginUserRow | null> {
  const canonical = normalizeLoginPhone(phone);
  const existing = await pickLoginUserForPhone(supabase, canonical);
  if (existing) {
    await canonicalizeDuplicateUserPhones(supabase, canonical);
    return existing;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("users")
    .insert({
      phone: canonical,
      phone_verified: true,
      trust_badge: "bronze",
      referred_by: options?.referredBy ?? null,
    })
    .select("id, display_name, trust_badge")
    .single();

  if (inserted) return inserted as LoginUserRow;

  if (insErr) {
    console.warn("[resolve-login-user] insert fallback after error", insErr.message);
    const retry = await pickLoginUserForPhone(supabase, canonical);
    if (retry) {
      await canonicalizeDuplicateUserPhones(supabase, canonical);
      return retry;
    }
  }

  return null;
}
