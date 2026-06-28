import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";
import { decryptPiiInChatBody, encryptPiiInChatBody } from "@/lib/pii-crypto";

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
  return (data ?? []).map((row) => ({
    ...(row as ListingMessageRow),
    body: decryptPiiInChatBody(String((row as ListingMessageRow).body ?? "")),
  }));
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
  const storedBody = encryptPiiInChatBody(opts.body);
  const { data, error } = await supabase
    .from("listing_messages")
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      body: storedBody,
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

  return {
    ...(data as ListingMessageRow),
    body: decryptPiiInChatBody(String(data.body ?? "")),
  };
}

/** Decrypt message body from DB row (for routes that query listing_messages directly). */
export function decryptListingMessageRow<T extends { body?: string | null }>(row: T): T {
  if (!row?.body) return row;
  return { ...row, body: decryptPiiInChatBody(String(row.body)) };
}

export function decryptListingMessageRows<T extends { body?: string | null }>(rows: T[]): T[] {
  return rows.map((row) => decryptListingMessageRow(row));
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
