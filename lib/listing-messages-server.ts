import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";

export type ListingMessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/** Load messages for a conversation row id (UUID variant-safe). */
export async function listConversationMessages(
  supabase: SupabaseClient,
  conversationRowId: string,
): Promise<ListingMessageRow[]> {
  const convVars = idMatchVariantsForIn(conversationRowId);
  const { data, error } = await supabase
    .from("listing_messages")
    .select("id,sender_id,body,created_at")
    .in("conversation_id", convVars)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[listing-messages] list", error);
    return [];
  }
  return (data ?? []) as ListingMessageRow[];
}
