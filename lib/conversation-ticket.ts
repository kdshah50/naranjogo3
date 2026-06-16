import type { SupabaseClient } from "@supabase/supabase-js";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/auth-server";

/** Latest paid booking ticket for a listing + buyer pair (NG-…), if any. */
export async function latestTicketForListingBuyer(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<string | null> {
  const buyerPool = await expandUserAccountIdPool(supabase, buyerId);
  const listingVariants = idMatchVariantsForIn(listingId);
  const { data } = await supabase
    .from("service_bookings")
    .select("ticket_code,updated_at")
    .in("listing_id", listingVariants)
    .in("buyer_id", buyerPool)
    .eq("payment_status", "paid")
    .not("ticket_code", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const code = data?.ticket_code?.trim();
  return code || null;
}

/** Batch ticket lookup keyed by normalized buyer_id. */
export async function latestTicketsForListingBuyers(
  supabase: SupabaseClient,
  listingId: string,
  buyerIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (buyerIds.length === 0) return out;

  const listingVariants = idMatchVariantsForIn(listingId);
  const buyerPoolByNorm = new Map<string, string[]>();
  const allBuyerIds = new Set<string>();
  for (const bid of buyerIds) {
    const pool = await expandUserAccountIdPool(supabase, bid);
    buyerPoolByNorm.set(bid.trim().toLowerCase(), pool);
    for (const id of pool) allBuyerIds.add(id);
  }

  const { data: rows } = await supabase
    .from("service_bookings")
    .select("buyer_id,ticket_code,updated_at")
    .in("listing_id", listingVariants)
    .in("buyer_id", [...allBuyerIds])
    .eq("payment_status", "paid")
    .not("ticket_code", "is", null)
    .order("updated_at", { ascending: false });

  for (const bid of buyerIds) {
    const norm = bid.trim().toLowerCase();
    const pool = buyerPoolByNorm.get(norm) ?? [];
    const poolSet = new Set(pool.map((id) => id.trim().toLowerCase()));
    const match = (rows ?? []).find((r) => poolSet.has(String(r.buyer_id).trim().toLowerCase()));
    if (match?.ticket_code) out.set(norm, String(match.ticket_code));
  }
  return out;
}

export const MAX_INBOX_THREADS = 2;
