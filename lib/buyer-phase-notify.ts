import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { sendWhatsApp, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";
import { hasBuyerPhaseNotify, recordBuyerPhaseNotify } from "@/lib/booking-lifecycle";

/**
 * WhatsApp nudge when seller advances booking (scheduled / in progress). Skips `completed` (handled by review prompt).
 */
export type BuyerPhaseWhatsAppResult =
  | { delivered: true }
  | { delivered: false; reason: "deduped" | "not_paid" | "no_booking" | "no_buyer_phone" | "twilio_unconfigured" | "send_failed" };

function digitsForWhatsApp(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const d = canonicalizeAuthPhone(normalizeAuthPhone(s));
  return d || "";
}

export async function notifyBuyerLifecyclePhase(
  supabase: SupabaseClient,
  bookingId: string,
  phase: "scheduled" | "in_progress"
): Promise<BuyerPhaseWhatsAppResult> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return { delivered: false, reason: "no_booking" };

  if (await hasBuyerPhaseNotify(supabase, bookingId, phase)) {
    return { delivered: false, reason: "deduped" };
  }

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,listing_id,ticket_code,status,payment_status")
    .in("id", idVars)
    .maybeSingle();

  if (!booking) return { delivered: false, reason: "no_booking" };
  if (booking.payment_status !== "paid") return { delivered: false, reason: "not_paid" };

  const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  if (buyerPool.length === 0) {
    console.warn("[buyer-phase-notify] empty buyer pool", { bookingId });
    return { delivered: false, reason: "no_buyer_phone" };
  }

  const { data: buyerRows } = await supabase.from("users").select("id,phone").in("id", buyerPool);

  let buyerDigits = "";
  for (const row of buyerRows ?? []) {
    const d = digitsForWhatsApp(row?.phone);
    if (d.length >= 11) {
      buyerDigits = d;
      break;
    }
  }
  if (!buyerDigits) {
    console.warn("[buyer-phase-notify] no buyer phone on any merged account", {
      bookingId,
      poolSize: buyerPool.length,
    });
    return { delivered: false, reason: "no_buyer_phone" };
  }

  if (!isTwilioWhatsAppConfigured()) {
    console.warn("[buyer-phase-notify] Twilio WhatsApp not configured (check TWILIO_* env)");
    return { delivered: false, reason: "twilio_unconfigured" };
  }

  const { data: listingRow } = await supabase
    .from("listings")
    .select("title_es")
    .eq("id", booking.listing_id)
    .maybeSingle();
  const title = listingRow?.title_es?.trim() || "Tu servicio";

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? `Ticket: *${booking.ticket_code}*` : `Reserva: \`${booking.id.slice(0, 8)}…\``;
  const bookingsUrl = `${appUrl}/my-bookings`;

  const body =
    phase === "scheduled"
      ? [
          `📅 *Visita agendada — Naranjogo*`,
          ``,
          `El proveedor registró tu servicio como *agendado*.`,
          `*${title}*`,
          ticket,
          ``,
          `Seguimiento y garantía en la app:`,
          bookingsUrl,
        ].join("\n")
      : [
          `🔧 *Servicio en curso — Naranjogo*`,
          ``,
          `El proveedor indicó que *ya inició* el trabajo.`,
          `*${title}*`,
          ticket,
          ``,
          `Detalles en:`,
          bookingsUrl,
        ].join("\n");

  const ok = await sendWhatsApp(buyerDigits, body);
  if (ok) {
    await recordBuyerPhaseNotify(supabase, String(booking.id), phase);
    return { delivered: true };
  }
  return { delivered: false, reason: "send_failed" };
}
