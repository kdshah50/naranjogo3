import type { SupabaseClient } from "@supabase/supabase-js";

import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn, sortRowsWithPreferredUserId } from "@/lib/user-id-variants";
import { sendWhatsAppToE164Digits } from "@/lib/twilio";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { getPublicAppUrl } from "@/lib/app-url";

/**
 * WhatsApp the counterpart when one party cancels (best-effort; no dedupe table — disputes rely on booking_events).
 */
export async function notifyBookingCancelledParty(
  supabase: SupabaseClient,
  bookingId: string,
  cancelledByRole: "buyer" | "seller",
  reasonCode: string
): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,seller_id,listing_id,ticket_code,payment_status")
    .in("id", idVars)
    .maybeSingle();

  if (!booking || booking.payment_status !== "paid") return;

  const { data: listingRow } = await supabase
    .from("listings")
    .select("title_es")
    .eq("id", booking.listing_id)
    .maybeSingle();
  const title = listingRow?.title_es?.trim() || "Tu servicio";

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? `Ticket: *${booking.ticket_code}*` : "";
  const listingsUrl = cancelledByRole === "seller" ? `${appUrl}/my-bookings` : `${appUrl}/seller-bookings`;

  let recipientDigits = "";

  if (cancelledByRole === "buyer") {
    const sellerPool = await expandUserAccountIdPool(supabase, String(booking.seller_id));
    const { data: rowsRaw } = await supabase.from("users").select("id,phone").in("id", sellerPool);
    const rows = sortRowsWithPreferredUserId(rowsRaw ?? [], String(booking.seller_id));
    for (const r of rows) {
      const d = e164DigitsForWhatsAppRecipient(r?.phone);
      if (d) {
        recipientDigits = d;
        break;
      }
    }
  } else {
    const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
    const { data: rowsRaw } = await supabase.from("users").select("id,phone").in("id", buyerPool);
    const rows = sortRowsWithPreferredUserId(rowsRaw ?? [], String(booking.buyer_id));
    for (const r of rows) {
      const d = e164DigitsForWhatsAppRecipient(r?.phone);
      if (d) {
        recipientDigits = d;
        break;
      }
    }
  }

  if (!recipientDigits) return;

  const who = cancelledByRole === "buyer" ? "El cliente" : "El proveedor";
  const body = [
    `❌ *Reserva cancelada — Naranjogo*`,
    ``,
    `${who} canceló la reserva.`,
    `Motivo registrado: _${reasonCode}_`,
    `*${title}*`,
    ticket,
    ``,
    `Ver detalle:`,
    listingsUrl,
  ]
    .filter(Boolean)
    .join("\n");

  await sendWhatsAppToE164Digits(recipientDigits, body);
}
