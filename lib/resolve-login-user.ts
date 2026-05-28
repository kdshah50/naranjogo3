import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneIdentityKey, storageAuthPhone } from "@/lib/phone";
import { phoneLookupVariants } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type LoginUserRow = {
  id: string;
  display_name: string | null;
  trust_badge: string;
  phone_verified?: boolean | null;
  phone?: string | null;
  created_at?: string | null;
};

function normalizeLoginPhone(phone: string): string {
  return storageAuthPhone(phone);
}

/** All stored `phone` variants to match one logical WhatsApp number. */
export function phoneVariantsForLookup(phone: string): string[] {
  const canonical = normalizeLoginPhone(phone);
  return phoneLookupVariants(canonical);
}

/** All `users.id` values that share this phone (any stored format). */
export async function userIdsForAuthPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<string[]> {
  const variants = phoneVariantsForLookup(normalizeLoginPhone(phone));
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

async function listingCountForUser(supabase: SupabaseClient, userId: string): Promise<number> {
  const vars = idMatchVariantsForIn(userId);
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", vars);
  if (error) return 0;
  return count ?? 0;
}

async function paidBookingTouchCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const vars = idMatchVariantsForIn(userId);
  const { count: asBuyer, error: bErr } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("buyer_id", vars)
    .eq("payment_status", "paid");
  const { count: asSeller, error: sErr } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", vars)
    .eq("payment_status", "paid");
  if (bErr || sErr) return 0;
  return (asBuyer ?? 0) + (asSeller ?? 0);
}

/** Pick the row that should own this phone after a merge (most activity + verified). */
export async function pickLoginUserForPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<LoginUserRow | null> {
  const variants = phoneVariantsForLookup(normalizeLoginPhone(phone));
  if (variants.length === 0) return null;

  const { data: users, error } = await supabase
    .from("users")
    .select("id, display_name, trust_badge, phone_verified, phone, created_at")
    .in("phone", variants)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[resolve-login-user] pickLoginUserForPhone", error);
    return null;
  }
  if (!users?.length) return null;
  if (users.length === 1) return users[0] as LoginUserRow;

  let best = users[0] as LoginUserRow;
  let bestScore = -1;

  for (const row of users as LoginUserRow[]) {
    let score = 0;
    if (row.phone_verified) score += 100;
    if (String(row.display_name ?? "").trim()) score += 20;
    score += (await listingCountForUser(supabase, row.id)) * 15;
    score += (await paidBookingTouchCount(supabase, row.id)) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best;
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

/** Find duplicate phone groups still in DB (canonical key → user rows). */
export async function findDuplicatePhoneGroups(
  supabase: SupabaseClient,
): Promise<Map<string, LoginUserRow[]>> {
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, display_name, trust_badge, phone_verified, phone, created_at")
    .not("phone", "is", null);

  if (error) throw error;

  const groups = new Map<string, LoginUserRow[]>();
  for (const row of (rows ?? []) as LoginUserRow[]) {
    const key = phoneIdentityKey(row.phone);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    if (list.length <= 1) groups.delete(key);
  }
  return groups;
}

export function samePhoneIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneIdentityKey(a);
  const kb = phoneIdentityKey(b);
  return Boolean(ka && kb && ka === kb);
}
