import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";
import { normalizeQuoteStatus, parseQuoteLineItems, parseQuoteMetadata } from "@/lib/service-quote";

export type ServiceQuoteGateRow = {
  quoteStatus: ReturnType<typeof normalizeQuoteStatus>;
  agreedSubtotalMxnCents: number | null;
  sellerSetAgreedPriceAt: string | null;
  quoteLineItems: ReturnType<typeof parseQuoteLineItems>;
  quoteMetadata: ReturnType<typeof parseQuoteMetadata>;
  quoteSentAt: string | null;
  quoteRespondedAt: string | null;
};

export async function loadServiceQuoteGate(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<ServiceQuoteGateRow | null> {
  const listVars = idMatchVariantsForIn(listingId);
  const buyerVars = idMatchVariantsForIn(buyerId);
  if (listVars.length === 0 || buyerVars.length === 0) return null;

  const { data: gate } = await supabase
    .from("listing_service_contact_gate")
    .select(
      "agreed_subtotal_mxn_cents,seller_set_agreed_price_at,quote_status,quote_line_items,quote_metadata,quote_sent_at,quote_responded_at",
    )
    .in("listing_id", listVars)
    .in("buyer_id", buyerVars)
    .maybeSingle();

  if (!gate) {
    return {
      quoteStatus: "none",
      agreedSubtotalMxnCents: null,
      sellerSetAgreedPriceAt: null,
      quoteLineItems: null,
      quoteMetadata: null,
      quoteSentAt: null,
      quoteRespondedAt: null,
    };
  }

  return {
    quoteStatus: normalizeQuoteStatus(gate.quote_status),
    agreedSubtotalMxnCents:
      gate.agreed_subtotal_mxn_cents != null ? Number(gate.agreed_subtotal_mxn_cents) : null,
    sellerSetAgreedPriceAt: gate.seller_set_agreed_price_at ?? null,
    quoteLineItems: parseQuoteLineItems(gate.quote_line_items),
    quoteMetadata: parseQuoteMetadata(gate.quote_metadata),
    quoteSentAt: gate.quote_sent_at ?? null,
    quoteRespondedAt: gate.quote_responded_at ?? null,
  };
}

/** Linked buyer accounts (same WhatsApp) may have gate rows under a sibling user id. */
export async function loadServiceQuoteGateForBuyerPool(
  supabase: SupabaseClient,
  listingId: string,
  buyerPool: string[],
): Promise<ServiceQuoteGateRow | null> {
  const unique = [...new Set(buyerPool.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  let best: ServiceQuoteGateRow | null = null;
  for (const bid of unique) {
    const row = await loadServiceQuoteGate(supabase, listingId, bid);
    if (!row) continue;
    if (row.quoteStatus === "pending" || row.quoteStatus === "accepted") return row;
    if (!best) {
      best = row;
      continue;
    }
    const rank = (s: string) =>
      s === "declined" ? 2 : s === "none" ? 1 : 0;
    if (rank(row.quoteStatus) > rank(best.quoteStatus)) best = row;
    else if (
      row.quoteStatus === best.quoteStatus &&
      (row.quoteLineItems?.length ?? 0) > (best.quoteLineItems?.length ?? 0)
    ) {
      best = row;
    }
  }
  return best;
}

export async function insertListingChatMessage(
  supabase: SupabaseClient,
  conversationId: string,
  senderId: string,
  body: string,
): Promise<{ id: string; sender_id: string; body: string; created_at: string } | null> {
  const { data, error } = await supabase
    .from("listing_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
    })
    .select("id,sender_id,body,created_at")
    .single();
  if (error || !data) {
    console.error("[service-quote] insert message", error);
    return null;
  }
  return data as { id: string; sender_id: string; body: string; created_at: string };
}

export async function resolveConversationForBuyer(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<{ id: string; buyer_id: string } | null> {
  const listVars = idMatchVariantsForIn(listingId);
  const buyerVars = idMatchVariantsForIn(buyerId);
  const { data: conv } = await supabase
    .from("listing_conversations")
    .select("id,buyer_id")
    .in("listing_id", listVars)
    .in("buyer_id", buyerVars)
    .limit(1)
    .maybeSingle();
  return conv?.id ? { id: String(conv.id), buyer_id: String(conv.buyer_id ?? buyerId) } : null;
}

/**
 * Start a new quote cycle after a completed job (or explicit rebook).
 * Keeps buyer contact + last menu picks in metadata; clears active quote state.
 */
export async function prepareQuoteGateForRebook(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<{ ok: boolean; buyerId: string }> {
  const gate = await loadServiceQuoteGate(supabase, listingId, buyerId);
  const lineItems = gate?.quoteLineItems ?? [];
  const existingMeta = gate?.quoteMetadata ?? {};
  const rebookPrefill =
    lineItems.length > 0 ? lineItems : existingMeta.rebookPrefillLineItems ?? null;

  const metadata = {
    ...existingMeta,
    kind: "buyer_request" as const,
    rebookPrefillLineItems: rebookPrefill ?? undefined,
    preferredAt: undefined,
  };
  delete (metadata as { preferredAt?: string }).preferredAt;

  const listVars = idMatchVariantsForIn(listingId);
  const buyerVars = idMatchVariantsForIn(buyerId);
  const { data: gateRow } = await supabase
    .from("listing_service_contact_gate")
    .select("buyer_id")
    .in("listing_id", listVars)
    .in("buyer_id", buyerVars)
    .limit(1)
    .maybeSingle();

  const gateBuyerId = String(gateRow?.buyer_id ?? buyerId);
  const now = new Date().toISOString();

  await supabase.from("listing_service_contact_gate").upsert(
    {
      listing_id: listingId,
      buyer_id: gateBuyerId,
      contacted_in_app: true,
      quote_status: "none",
      quote_line_items: null,
      quote_metadata: metadata,
      agreed_subtotal_mxn_cents: null,
      quote_sent_at: null,
      quote_responded_at: null,
      updated_at: now,
    },
    { onConflict: "listing_id,buyer_id" },
  );

  return { ok: true, buyerId: gateBuyerId };
}
