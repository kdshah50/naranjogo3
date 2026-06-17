import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { getPublicAppUrl } from "@/lib/app-url";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { phoneDigitsForAccountPool } from "@/lib/user-phone-notify";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { hasSellerPhaseNotify, recordSellerPhaseNotify } from "@/lib/booking-lifecycle";
import { listingChatAbsoluteUrl, findListingConversationIdForBuyer } from "@/lib/listing-chat-deep-link";

export type SellerPhaseWhatsAppResult =
  | { delivered: true }
  | {
      delivered: false;
      reason: "deduped" | "not_paid" | "no_booking" | "no_seller_phone" | "twilio_unconfigured" | "send_failed";
    };

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

/** WhatsApp confirmation to the provider when they advance booking to scheduled / in progress. */
export async function notifySellerLifecyclePhase(
  supabase: SupabaseClient,
  bookingId: string,
  phase: "scheduled" | "in_progress",
): Promise<SellerPhaseWhatsAppResult> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return { delivered: false, reason: "no_booking" };

  if (await hasSellerPhaseNotify(supabase, bookingId, phase)) {
    return { delivered: false, reason: "deduped" };
  }

  const { data: booking } = await supabase
    .from("service_bookings")
    .select(
      "id,buyer_id,seller_id,listing_id,ticket_code,status,payment_status,appointment_at,seller_phone_snapshot",
    )
    .in("id", idVars)
    .maybeSingle();

  if (!booking) return { delivered: false, reason: "no_booking" };
  if (booking.payment_status !== "paid") return { delivered: false, reason: "not_paid" };

  let sellerDigits = e164DigitsForWhatsAppRecipient(String(booking.seller_phone_snapshot ?? ""));
  if (!sellerDigits) {
    sellerDigits = await phoneDigitsForAccountPool(supabase, String(booking.seller_id));
  }
  if (!sellerDigits) {
    console.warn("[seller-phase-notify] no seller phone", { bookingId });
    return { delivered: false, reason: "no_seller_phone" };
  }

  if (!isTwilioWhatsAppConfigured()) {
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

  const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  const { data: buyerRows } = await supabase
    .from("users")
    .select("display_name,phone")
    .in("id", buyerPool)
    .limit(1);
  const buyerName =
    buyerRows?.[0]?.display_name?.trim() ||
    (buyerRows?.[0]?.phone ? `Cliente …${buyerRows[0].phone.replace(/\D/g, "").slice(-4)}` : "Cliente");

  const convId = await findListingConversationIdForBuyer(
    supabase,
    String(booking.listing_id),
    String(booking.buyer_id),
  );

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? String(booking.ticket_code) : null;
  const sellerBookingsUrl = ticket
    ? `${appUrl}/seller-bookings?ticket=${encodeURIComponent(ticket)}`
    : `${appUrl}/seller-bookings`;
  const listingUrl = listingChatAbsoluteUrl(String(booking.listing_id), convId);
  const appt = formatAppointmentEs(booking.appointment_at);

  const body =
    phase === "scheduled"
      ? [
          `📅 *Reserva agendada — Naranjogo*`,
          ``,
          `Registraste el servicio como *agendado*.`,
          appt ? `Fecha: *${appt}*` : null,
          `*${title}*`,
          `Cliente: *${buyerName}*`,
          ticket ? `Ticket: *${ticket}*` : null,
          ``,
          `Gestiona la reserva:`,
          sellerBookingsUrl,
          ``,
          `Chat con el cliente:`,
          listingUrl,
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `🔧 *Servicio en curso — Naranjogo*`,
          ``,
          `Registraste el servicio como *en curso*.`,
          `*${title}*`,
          `Cliente: *${buyerName}*`,
          ticket ? `Ticket: *${ticket}*` : null,
          ``,
          `Gestiona la reserva:`,
          sellerBookingsUrl,
          ``,
          `Chat con el cliente:`,
          listingUrl,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(sellerDigits, body);
  if (ok) {
    await recordSellerPhaseNotify(supabase, String(booking.id), phase);
    return { delivered: true };
  }
  return { delivered: false, reason: "send_failed" };
}

/** WhatsApp confirmation to the provider when they mark the booking completed. */
export async function notifySellerBookingCompleted(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<SellerPhaseWhatsAppResult> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return { delivered: false, reason: "no_booking" };

  if (await hasSellerPhaseNotify(supabase, bookingId, "completed")) {
    return { delivered: false, reason: "deduped" };
  }

  const { data: booking } = await supabase
    .from("service_bookings")
    .select(
      "id,buyer_id,seller_id,listing_id,ticket_code,status,payment_status,seller_phone_snapshot,balance_due_mxn_cents,balance_payment_status",
    )
    .in("id", idVars)
    .maybeSingle();

  if (!booking) return { delivered: false, reason: "no_booking" };
  if (booking.payment_status !== "paid") return { delivered: false, reason: "not_paid" };
  if (booking.status !== "completed") return { delivered: false, reason: "no_booking" };

  let sellerDigits = e164DigitsForWhatsAppRecipient(String(booking.seller_phone_snapshot ?? ""));
  if (!sellerDigits) {
    sellerDigits = await phoneDigitsForAccountPool(supabase, String(booking.seller_id));
  }
  if (!sellerDigits) {
    console.warn("[seller-phase-notify] no seller phone (completed)", { bookingId });
    return { delivered: false, reason: "no_seller_phone" };
  }

  if (!isTwilioWhatsAppConfigured()) {
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

  const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  const { data: buyerRows } = await supabase
    .from("users")
    .select("display_name,phone")
    .in("id", buyerPool)
    .limit(1);
  const buyerName =
    buyerRows?.[0]?.display_name?.trim() ||
    (buyerRows?.[0]?.phone ? `Cliente …${buyerRows[0].phone.replace(/\D/g, "").slice(-4)}` : "Cliente");

  const convId = await findListingConversationIdForBuyer(
    supabase,
    String(booking.listing_id),
    String(booking.buyer_id),
  );

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? String(booking.ticket_code) : null;
  const sellerBookingsUrl = ticket
    ? `${appUrl}/seller-bookings?ticket=${encodeURIComponent(ticket)}`
    : `${appUrl}/seller-bookings`;
  const listingUrl = listingChatAbsoluteUrl(String(booking.listing_id), convId);

  const balanceCents = Math.round(Number(booking.balance_due_mxn_cents ?? 0));
  const balancePending =
    String(booking.balance_payment_status ?? "") === "pending" && balanceCents >= 100;
  const balanceLine = balancePending
    ? `El cliente recibirá enlace para pagar el saldo (~$${Math.round(balanceCents / 100).toLocaleString("es-MX")} MXN) en la app.`
    : null;

  const body = [
    `✅ *Servicio completado — Naranjogo*`,
    ``,
    `Registraste el servicio como *completado*.`,
    `*${title}*`,
    `Cliente: *${buyerName}*`,
    ticket ? `Ticket: *${ticket}*` : null,
    balanceLine,
    ``,
    `Ver reserva:`,
    sellerBookingsUrl,
    ``,
    `Chat con el cliente:`,
    listingUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const ok = await sendWhatsAppToE164Digits(sellerDigits, body);
  if (ok) {
    await recordSellerPhaseNotify(supabase, String(booking.id), "completed");
    return { delivered: true };
  }
  return { delivered: false, reason: "send_failed" };
}
