import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

/** Phone strings that might refer to the same `users` row (OTP vs /unete formatting). */
export function phoneLookupVariants(phone: string | null | undefined): string[] {
  if (phone == null || !String(phone).trim()) return [];
  const raw = String(phone).trim();
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(raw));
  return [...new Set([raw, digits, `+${digits}`].filter(Boolean))];
}

const MAX_ACCOUNT_POOL_PHONE_ITERS = 6;

/**
 * JWT sub, `users.id` casing duplicates, and **all** `users` rows linked by phone
 * (including transitive: A–B share a phone, B–C share another → A,B,C merge).
 * Fixes provider logged in as one row while listings/bookings use another `seller_id`.
 */
export async function expandUserAccountIdPool(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const pool = new Set<string>(idMatchVariantsForIn(userId));

  for (let iter = 0; iter < MAX_ACCOUNT_POOL_PHONE_ITERS; iter++) {
    const beforeSize = pool.size;
    const idBatch = [...pool];
    if (idBatch.length === 0) break;

    const { data: rows } = await supabase.from("users").select("id,phone").in("id", idBatch);
    const phoneFilters = new Set<string>();
    for (const r of rows ?? []) {
      for (const v of idMatchVariantsForIn(r.id)) pool.add(v);
      for (const pv of phoneLookupVariants(r.phone)) {
        if (pv) phoneFilters.add(pv);
      }
    }

    if (phoneFilters.size > 0) {
      const { data: samePhone } = await supabase.from("users").select("id").in("phone", [...phoneFilters]);
      for (const row of samePhone ?? []) {
        for (const v of idMatchVariantsForIn(row.id)) pool.add(v);
      }
    }

    if (pool.size === beforeSize) break;
  }

  return [...pool].filter(Boolean);
}

export function poolsOverlap(a: string[], b: string[]): boolean {
  const bs = new Set(b);
  return a.some((x) => bs.has(x));
}

export async function userIsListingSellerAccount(
  supabase: SupabaseClient,
  userId: string,
  listingSellerId: string
): Promise<boolean> {
  const [my, theirs] = await Promise.all([
    expandUserAccountIdPool(supabase, userId),
    expandUserAccountIdPool(supabase, listingSellerId),
  ]);
  return poolsOverlap(my, theirs);
}

export async function userParticipatesInConversation(
  supabase: SupabaseClient,
  userId: string,
  convBuyerId: string,
  convSellerId: string
): Promise<boolean> {
  const [my, b, s] = await Promise.all([
    expandUserAccountIdPool(supabase, userId),
    expandUserAccountIdPool(supabase, convBuyerId),
    expandUserAccountIdPool(supabase, convSellerId),
  ]);
  return poolsOverlap(my, b) || poolsOverlap(my, s);
}
