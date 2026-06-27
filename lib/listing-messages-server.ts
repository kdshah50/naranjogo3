import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";

export type ListingMessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ListingMessageSource =
  | "user"
  | "system"
  | "quote_request"
  | "quote_send"
  | "quote_respond"
  | "payment"
  | "booking_lifecycle";

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

/** Single insert path for listing chat — DB trigger writes append-only audit row. */
export async function insertListingMessage(
  supabase: SupabaseClient,
  opts: {
    conversationId: string;
    senderId: string;
    body: string;
    source?: ListingMessageSource;
  },
): Promise<ListingMessageRow | null> {
  const source = opts.source ?? "user";
  const { data, error } = await supabase
    .from("listing_messages")
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      body: opts.body,
      message_source: source,
    })
    .select("id,sender_id,body,created_at")
    .single();

  if (error || !data) {
    console.error("[listing-messages] insert", { source, error });
    return null;
  }

  console.info("[listing-messages] inserted", {
    messageId: data.id,
    conversationId: opts.conversationId,
    source,
    senderTail: String(opts.senderId).slice(-8),
    bodyChars: opts.body.length,
  });

  return data as ListingMessageRow;
}

export async function touchConversationUpdatedAt(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("listing_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) console.error("[listing-messages] touch conversation", error);
}
