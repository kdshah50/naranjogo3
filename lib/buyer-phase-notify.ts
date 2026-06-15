import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";
import { hasBuyerPhaseNotify, recordBuyerPhaseNotify } from "@/lib/booking-lifecycle";
import { phoneDigitsForAccountPool } from "@/lib/user-phone-notify";

/**
 * WhatsApp nudge when seller advances booking (scheduled / in progress). Skips `completed` (handled by review prompt).
 */
export type BuyerPhaseWhatsAppResult =
  | { delivered: true }
  | { delivered: false; reason: "deduped" | "not_paid" | "no_booking" | "no_buyer_phone" | "twilio_unconfigured" | "send_failed" };

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

export async function notifyBuyerLifecyclePhase(
  supabase: SupabaseClient,
  bookingId: string,
  phase: "scheduled" | "in_progress",
): Promise<BuyerPhaseWhatsAppResult> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return { delivered: false, reason: "no_booking" };

  if (await hasBuyerPhaseNotify(supabase, bookingId, phase)) {
    return { delivered: false, reason: "deduped" };
  }

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,listing_id,ticket_code,status,payment_status,appointment_at")
    .in("id", idVars)
    .maybeSingle();

  if (!booking) return { delivered: false, reason: "no_booking" };
  if (booking.payment_status !== "paid") return { delivered: false, reason: "not_paid" };

  const buyerDigits = await phoneDigitsForAccountPool(supabase, String(booking.buyer_id));
  if (!buyerDigits) {
    console.warn("[buyer-phase-notify] no buyer phone on any merged account", { bookingId });
    return { delivered: false, reason: "no_buyer_phone" };
  }

  if (!isTwilioWhatsAppConfigured()) {
    console.warn("[buyer-phase-notify] Twilio WhatsApp not configured (check TWILIO_* env)");
    return { delivered: false, reason: "twilio_unconfigured" };
  }

  const listingIdVars = idMatchVariantsForIn(String(booking.listing_id));
  const { data: listingRow } = await supabase
    .from("listings")
    .select("title_es")
    .in("id", listingIdVars)
    .limit(1)
    .maybeSingle();
  const title = listingRow?.title_es?.trim() || "Tu servicio";

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? String(booking.ticket_code) : null;
  const ticketLine = ticket ? `Ticket: *${ticket}*` : `Reserva: \`${booking.id.slice(0, 8)}…\``;
  const bookingDetailUrl = `${appUrl}/booking/success?id=${encodeURIComponent(String(booking.id))}`;
  const bookingsUrl = ticket
    ? `${appUrl}/my-bookings?ticket=${encodeURIComponent(ticket)}`
    : `${appUrl}/my-bookings`;
  const appt = formatAppointmentEs(booking.appointment_at);

  const body =
    phase === "scheduled"
      ? [
          `📅 *Visita agendada — Naranjogo*`,
          ``,
          `El proveedor registró tu servicio como *agendado*.`,
          appt ? `Fecha acordada: *${appt}*` : null,
          `*${title}*`,
          ticketLine,
          ``,
          `Abre tu reserva:`,
          bookingDetailUrl,
          ``,
          `Mis reservas:`,
          bookingsUrl,
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `🔧 *Servicio en curso — Naranjogo*`,
          ``,
          `El proveedor indicó que *ya inició* el trabajo.`,
          `*${title}*`,
          ticketLine,
          ``,
          `Abre tu reserva:`,
          bookingDetailUrl,
          ``,
          `Mis reservas:`,
          bookingsUrl,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(buyerDigits, body);
  if (ok) {
    await recordBuyerPhaseNotify(supabase, String(booking.id), phase);
    return { delivered: true };
  }
  return { delivered: false, reason: "send_failed" };
}
