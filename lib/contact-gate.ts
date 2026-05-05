import type { SupabaseClient } from "@supabase/supabase-js";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

/** If contact_gate row failed to update, still unlock when buyer has sent any in-app message. */
export async function buyerHasSentInAppMessage(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string
): Promise<boolean> {
  const pool = await expandUserAccountIdPool(supabase, buyerId);
  const { data: conv } = await supabase
    .from("listing_conversations")
    .select("id")
    .eq("listing_id", listingId)
    .in("buyer_id", pool)
    .maybeSingle();
  if (!conv?.id) return false;
  const { count, error } = await supabase
    .from("listing_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .in("sender_id", pool);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function ensureContactGateFromMessages(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("listing_service_contact_gate").upsert(
    {
      listing_id: listingId,
      buyer_id: buyerId,
      contacted_in_app: true,
      updated_at: now,
    },
    { onConflict: "listing_id,buyer_id" }
  );
  if (error) console.error("[contact-gate] upsert", error);
}

/**
 * If the buyer already completed a paid booking with this seller (any listing), treat the contact
 * gate as satisfied so they can pay again without re-sending a first message (rebook / new service).
 */
export async function unlockContactGateIfRepeatBuyerWithSeller(
  supabase: SupabaseClient,
  listingId: string,
  canonicalBuyerId: string,
  sellerId: string,
  buyerIdPool: string[]
): Promise<boolean> {
  const { data: prior, error } = await supabase
    .from("service_bookings")
    .select("id")
    .eq("seller_id", sellerId)
    .in("buyer_id", buyerIdPool)
    .eq("payment_status", "paid")
    .limit(1);
  if (error) {
    console.error("[contact-gate] repeat buyer check", error);
    return false;
  }
  if (!prior?.length) return false;
  await ensureContactGateFromMessages(supabase, listingId, canonicalBuyerId);
  return true;
}
