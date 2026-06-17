import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

/**
 * After Stripe marks a booking paid, append a short line to the listing chat thread
 * (if one exists) so buyer and provider see the update in-app, not only WhatsApp.
 * Idempotent per booking id (safe if webhook + verify-session both run).
 */
export async function appendListingChatPaymentNotice(
  supabase: SupabaseClient,
  booking: { id: string; listing_id: string; buyer_id: string; ticket_code: string | null }
): Promise<void> {
  const pool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  if (pool.length === 0) return;

  const listingVars = idMatchVariantsForIn(String(booking.listing_id));
  const { data: convRows } = await supabase
    .from("listing_conversations")
    .select("id,buyer_id")
    .in("listing_id", listingVars)
    .in("buyer_id", pool)
    .order("updated_at", { ascending: false })
    .limit(1);

  const conv = convRows?.[0];
  if (!conv?.id || !conv.buyer_id) return;

  const ticket = booking.ticket_code?.trim();
  const idTag = `id:${booking.id}`;
  const body = ticket
    ? `[Naranjogo] Reserva confirmada — depósito de plataforma pagado. Ticket: ${ticket}. ${idTag}`
    : `[Naranjogo] Reserva confirmada — depósito de plataforma pagado. ${idTag}`;

  const { data: dup } = await supabase
    .from("listing_messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .ilike("body", `%${booking.id}%`)
    .limit(1);

  if (dup?.length) return;

  const { error: insErr } = await supabase.from("listing_messages").insert({
    conversation_id: conv.id,
    sender_id: String(conv.buyer_id),
    body,
  });
  if (insErr) {
    console.error("[payment-confirmed-chat] insert", insErr);
    return;
  }

  await supabase
    .from("listing_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conv.id);
}

/** Load paid booking row and append chat notice (idempotent). Safe to call from webhook + verify-session. */
export async function appendListingChatPaymentNoticeForBookingId(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;
  const { data: row } = await supabase
    .from("service_bookings")
    .select("id,listing_id,buyer_id,ticket_code,payment_status")
    .in("id", idVars)
    .maybeSingle();
  if (!row || row.payment_status !== "paid") return;
  await appendListingChatPaymentNotice(supabase, {
    id: String(row.id),
    listing_id: String(row.listing_id),
    buyer_id: String(row.buyer_id),
    ticket_code: row.ticket_code ? String(row.ticket_code) : null,
  });
}

/** In-app notice when buyer accepts an official quote (seller may not receive browser events). */
export async function appendListingChatQuoteAcceptNotice(
  supabase: SupabaseClient,
  opts: {
    listingId: string;
    buyerId: string;
    conversationId: string;
    totalFormatted: string;
  },
): Promise<void> {
  const idTag = `quote-accepted:${opts.listingId}:${opts.buyerId}`;
  const body = `[Naranjogo] Cotización aceptada (${opts.totalFormatted}). El cliente puede pagar el depósito en la app. ${idTag}`;

  const { data: dup } = await supabase
    .from("listing_messages")
    .select("id")
    .eq("conversation_id", opts.conversationId)
    .ilike("body", `%${idTag}%`)
    .limit(1);
  if (dup?.length) return;

  const { error: insErr } = await supabase.from("listing_messages").insert({
    conversation_id: opts.conversationId,
    sender_id: String(opts.buyerId),
    body,
  });
  if (insErr) {
    console.error("[payment-confirmed-chat] quote-accept insert", insErr);
    return;
  }

  await supabase
    .from("listing_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", opts.conversationId);
}
