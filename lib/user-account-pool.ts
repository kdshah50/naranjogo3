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

/**
 * JWT sub, `users.id` casing duplicates, and multiple `users` rows for one phone
 * (provider signup vs OTP) — all ids that represent the same person for messaging/listings.
 */
export async function expandUserAccountIdPool(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const pool = new Set<string>(idMatchVariantsForIn(userId));
  const { data: me } = await supabase.from("users").select("id,phone").in("id", idMatchVariantsForIn(userId)).maybeSingle();
  if (me) {
    for (const v of idMatchVariantsForIn(me.id)) pool.add(v);
    const pvars = phoneLookupVariants(me.phone);
    if (pvars.length > 0) {
      const { data: samePhone } = await supabase.from("users").select("id").in("phone", pvars);
      for (const row of samePhone ?? []) {
        for (const v of idMatchVariantsForIn(row.id)) pool.add(v);
      }
    }
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
