import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { sendWhatsAppToE164Digits } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";
import { phoneDigitsForAccountPool } from "@/lib/user-phone-notify";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { appendListingChatPaymentNotice } from "@/lib/payment-confirmed-chat";
import { listingChatAbsoluteUrl, findListingConversationIdForBuyer } from "@/lib/listing-chat-deep-link";

/** If the process dies mid-notify, another worker can reclaim after this many ms. */
const STALE_NOTIFY_CLAIM_MS = 3 * 60 * 1000;

/**
 * One WhatsApp to the provider when a buyer pays the service/contact fee.
 * Uses seller_booking_paid_notify_claimed_at so webhook + verify-session do not double-send,
 * and so a crash between claim and Twilio does not permanently block delivery
 * (seller_booking_paid_notified_at is set only after send succeeds).
 */
export async function notifySellerBookingCommissionPaid(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;

  const staleBefore = new Date(Date.now() - STALE_NOTIFY_CLAIM_MS).toISOString();
  const claimedAt = new Date().toISOString();

  const { data: claimedRows, error: claimErr } = await supabase
    .from("service_bookings")
    .update({ seller_booking_paid_notify_claimed_at: claimedAt })
    .in("id", idVars)
    .eq("payment_status", "paid")
    .is("seller_booking_paid_notified_at", null)
    .or(`seller_booking_paid_notify_claimed_at.is.null,seller_booking_paid_notify_claimed_at.lt.${staleBefore}`)
    .select("id,buyer_id,seller_id,listing_id,commission_amount_cents,seller_phone_snapshot,ticket_code");

  if (claimErr) {
    console.error("[seller-booking-notify] claim", claimErr);
    return;
  }
  const row = claimedRows?.[0];
  if (!row) {
    return;
  }

  const releaseClaim = async () => {
    await supabase
      .from("service_bookings")
      .update({ seller_booking_paid_notify_claimed_at: null })
      .eq("id", row.id)
      .eq("payment_status", "paid")
      .is("seller_booking_paid_notified_at", null);
  };

  const markDelivered = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("service_bookings")
      .update({
        seller_booking_paid_notified_at: now,
        seller_booking_paid_notify_claimed_at: null,
      })
      .eq("id", row.id)
      .eq("payment_status", "paid");
    if (error) {
      console.error("[seller-booking-notify] markDelivered", error);
    }
  };

  try {
    const listingIdVars = idMatchVariantsForIn(String(row.listing_id));
    const { data: listingRows } = await supabase
      .from("listings")
      .select("title_es")
      .in("id", listingIdVars)
      .limit(1);
    const listingTitle = listingRows?.[0]?.title_es?.trim() || "tu anuncio";

    const buyerPool = await expandUserAccountIdPool(supabase, String(row.buyer_id));
    const { data: buyerRows } = await supabase
      .from("users")
      .select("display_name,phone")
      .in("id", buyerPool)
      .limit(1);
    const buyerName =
      buyerRows?.[0]?.display_name?.trim() ||
      (buyerRows?.[0]?.phone ? `Cliente …${buyerRows[0].phone.replace(/\D/g, "").slice(-4)}` : "Un cliente");

    const { data: ticketRow } = await supabase
      .from("service_bookings")
      .select("ticket_code")
      .eq("id", row.id)
      .maybeSingle();
    const ticketCode = ticketRow?.ticket_code ?? row.ticket_code;

    // In-app first: MX WhatsApp often fails on +52 while +521 delivers; provider still needs the update.
    try {
      await appendListingChatPaymentNotice(supabase, {
        id: String(row.id),
        listing_id: String(row.listing_id),
        buyer_id: String(row.buyer_id),
        ticket_code: ticketCode ? String(ticketCode) : null,
      });
    } catch (chatErr) {
      console.error("[seller-booking-notify] payment in-app chat (non-fatal)", chatErr);
    }

    let sellerDigits = e164DigitsForWhatsAppRecipient(row.seller_phone_snapshot?.trim() ?? "");
    if (!sellerDigits) {
      sellerDigits = await phoneDigitsForAccountPool(supabase, String(row.seller_id));
    }

    if (!sellerDigits) {
      console.warn("[seller-booking-notify] no seller phone", {
        bookingId: row.id,
        hint: "Set phone on provider profile or ensure seller_phone_snapshot after payment",
      });
      await releaseClaim();
      return;
    }

    const mxn = Math.round((row.commission_amount_cents ?? 0) / 100);
    const appUrl = getPublicAppUrl();
    const convId = await findListingConversationIdForBuyer(
      supabase,
      String(row.listing_id),
      String(row.buyer_id),
    );
    const listingUrl = listingChatAbsoluteUrl(String(row.listing_id), convId);
    const sellerBookingsUrl = ticketCode
      ? `${appUrl}/seller-bookings?ticket=${encodeURIComponent(String(ticketCode))}`
      : `${appUrl}/seller-bookings`;

    const msg = [
      `🎉 *Pago recibido en Naranjogo*`,
      ``,
      `Un cliente pagó la tarifa de servicio/contacto por:`,
      `*${listingTitle}*`,
      ``,
      `Cliente: ${buyerName}`,
      `Tarifa plataforma: ~$${mxn.toLocaleString("es-MX")} MXN`,
      ticketCode ? `Ticket cliente: *${ticketCode}*` : `ID interno: ${row.id}`,
      ``,
      `Gestiona la reserva (agendado → en curso → completado):`,
      sellerBookingsUrl,
      ``,
      `Mensajes con el cliente:`,
      listingUrl,
    ].join("\n");

    const ok = await sendWhatsAppToE164Digits(sellerDigits, msg);
    if (!ok) {
      console.error("[seller-booking-notify] WhatsApp send failed", {
        bookingId: row.id,
        sellerDigitsTail: sellerDigits.slice(-4),
      });
      await releaseClaim();
      return;
    }

    await markDelivered();
  } catch (e) {
    console.error("[seller-booking-notify]", e);
    await releaseClaim();
  }
}
