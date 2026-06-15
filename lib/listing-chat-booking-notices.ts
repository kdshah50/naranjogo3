import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/app-url";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export type BookingChatLifecyclePhase = "scheduled" | "in_progress" | "completed";

function formatAppointmentEs(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * In-app: append a [Naranjogo] line to the listing chat for this buyer (same thread as messaging).
 * Lets buyer + provider see scheduled / in progress / completed without relying on WhatsApp.
 * Idempotent per (booking id, phase). Mirrors appendListingChatPaymentNotice pattern.
 */
export async function appendListingChatBookingLifecycleNotice(
  supabase: SupabaseClient,
  booking: {
    id: string;
    listing_id: string;
    buyer_id: string;
    ticket_code: string | null;
    appointment_at?: string | null;
  },
  phase: BookingChatLifecyclePhase,
): Promise<void> {
  const listingVars = idMatchVariantsForIn(String(booking.listing_id));
  const pool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  if (pool.length === 0) return;

  const { data: convRows } = await supabase
    .from("listing_conversations")
    .select("id,buyer_id")
    .in("listing_id", listingVars)
    .in("buyer_id", pool)
    .order("updated_at", { ascending: false })
    .limit(1);

  const conv = convRows?.[0];
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
  const appt = formatAppointmentEs(booking.appointment_at);
  const appUrl = getPublicAppUrl();
  const ticketUrl = ticket
    ? `${appUrl}/my-bookings?ticket=${encodeURIComponent(ticket)}`
    : `${appUrl}/my-bookings`;

  let line: string;
  switch (phase) {
    case "scheduled":
      line = appt
        ? `[Naranjogo] El proveedor marcó tu servicio como agendado para ${appt}.`
        : "[Naranjogo] El proveedor marcó tu servicio como agendado.";
      break;
    case "in_progress":
      line = "[Naranjogo] El proveedor marcó el servicio como en curso.";
      break;
    case "completed": {
      const reviewUrl = `${appUrl}/my-bookings?review=${encodeURIComponent(booking.id)}`;
      line = `[Naranjogo] El proveedor marcó el servicio como completado. Deja tu reseña: ${reviewUrl}`;
      break;
    }
    default:
      return;
  }

  const body = [
    line,
    ticket ? `Ticket: ${ticket}.` : null,
    `Ver reserva: ${ticketUrl}`,
    `${idTag} ${phaseTag}`,
  ]
    .filter(Boolean)
    .join(" ");

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
