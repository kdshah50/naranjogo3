import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";

/** Align conversation.seller_id with listing owner when a row was created with a stale/orphan id. */
export async function repairConversationSellerIdIfStale(
  supabase: SupabaseClient,
  conversationId: string,
  listingId: string,
): Promise<void> {
  const { data: listing } = await supabase
    .from("listings")
    .select("seller_id")
    .in("id", idMatchVariantsForIn(listingId))
    .maybeSingle();
  const correctSellerId = listing?.seller_id ? String(listing.seller_id) : null;
  if (!correctSellerId) return;

  const { data: conv } = await supabase
    .from("listing_conversations")
    .select("seller_id")
    .in("id", idMatchVariantsForIn(conversationId))
    .maybeSingle();
  if (!conv?.seller_id || String(conv.seller_id) === correctSellerId) return;

  await supabase
    .from("listing_conversations")
    .update({ seller_id: correctSellerId })
    .in("id", idMatchVariantsForIn(conversationId));
}
