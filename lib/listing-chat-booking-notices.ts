import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export type BookingChatLifecyclePhase = "scheduled" | "in_progress" | "completed";

/**
 * In-app: append a [Naranjogo] line to the listing chat for this buyer (same thread as messaging).
 * Lets buyer + provider see scheduled / in progress / completed without relying on WhatsApp.
 * Idempotent per (booking id, phase). Mirrors appendListingChatPaymentNotice pattern.
 */
export async function appendListingChatBookingLifecycleNotice(
  supabase: SupabaseClient,
  booking: { id: string; listing_id: string; buyer_id: string; ticket_code: string | null },
  phase: BookingChatLifecyclePhase
): Promise<void> {
  const listingVars = idMatchVariantsForIn(String(booking.listing_id));
  const pool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  if (pool.length === 0) return;

  const { data: conv } = await supabase
    .from("listing_conversations")
    .select("id,buyer_id")
    .in("listing_id", listingVars)
    .in("buyer_id", pool)
    .maybeSingle();

  if (!conv?.id || !conv.buyer_id) return;

  const idTag = `id:${booking.id}`;
  const phaseTag = `phase:${phase}`;

  const { data: dup } = await supabase
    .from("listing_messages")
    .select("id")
    .eq("conversation_id", conv.id)
    .ilike("body", `%${idTag}%`)
    .ilike("body", `%${phaseTag}%`)
    .limit(1);

  if (dup?.length) return;

  const ticket = booking.ticket_code?.trim();
  let line: string;
  switch (phase) {
    case "scheduled":
      line = "[Naranjogo] El proveedor marcó tu servicio como agendado.";
      break;
    case "in_progress":
      line = "[Naranjogo] El proveedor marcó el servicio como en curso.";
      break;
    case "completed":
      line =
        "[Naranjogo] El proveedor marcó el servicio como completado. Puedes dejar una reseña en «Mis reservas».";
      break;
    default:
      return;
  }

  const body = [line, ticket ? `Ticket: ${ticket}.` : null, `${idTag} ${phaseTag}`].filter(Boolean).join(" ");

  const { error: insErr } = await supabase.from("listing_messages").insert({
    conversation_id: conv.id,
    sender_id: String(conv.buyer_id),
    body,
  });
  if (insErr) {
    console.error("[listing-chat-booking-notices] insert", insErr);
    return;
  }

  await supabase
    .from("listing_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conv.id);
}
