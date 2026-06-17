import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/app-url";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

/** Latest listing conversation for a buyer account pool (handles merged logins). */
export async function findListingConversationIdForBuyer(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<string | null> {
  const listingVars = idMatchVariantsForIn(String(listingId));
  const pool = await expandUserAccountIdPool(supabase, String(buyerId));
  if (pool.length === 0 || listingVars.length === 0) return null;

  const { data: convRows } = await supabase
    .from("listing_conversations")
    .select("id")
    .in("listing_id", listingVars)
    .in("buyer_id", pool)
    .order("updated_at", { ascending: false })
    .limit(1);

  const id = convRows?.[0]?.id;
  return id ? String(id) : null;
}

/** Relative path for in-app `<Link href>` (chat deep link + scroll anchor). */
export function listingChatPath(listingId: string, conversationId?: string | null): string {
  const chatQ = conversationId ? `?chat=${encodeURIComponent(conversationId)}` : "";
  return `/listing/${listingId}${chatQ}#listing-inapp-chat`;
}

/** Absolute URL for WhatsApp / outbound notifications. */
export function listingChatAbsoluteUrl(listingId: string, conversationId?: string | null): string {
  return `${getPublicAppUrl()}${listingChatPath(listingId, conversationId)}`;
}

export async function resolveListingChatPath(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<string> {
  const convId = await findListingConversationIdForBuyer(supabase, listingId, buyerId);
  return listingChatPath(listingId, convId);
}
