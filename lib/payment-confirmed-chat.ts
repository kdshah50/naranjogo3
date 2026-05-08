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
  const { data: conv } = await supabase
    .from("listing_conversations")
    .select("id,buyer_id")
    .in("listing_id", listingVars)
    .in("buyer_id", pool)
    .maybeSingle();

  if (!conv?.id || !conv.buyer_id) return;

  const ticket = booking.ticket_code?.trim();
  const idTag = `id:${booking.id}`;
  const body = ticket
    ? `[Naranjogo] Tarifa de plataforma pagada. Ticket: ${ticket}. ${idTag}`
    : `[Naranjogo] Tarifa de plataforma pagada. ${idTag}`;

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
