import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { sendWhatsAppToE164Digits } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";

const STALE_NOTIFY_CLAIM_MS = 3 * 60 * 1000;

function formatConfirmedEs(iso: string | null | undefined): string {
  if (!iso) return "Recién confirmada";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Mexico_City",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * One WhatsApp to the buyer after commission is paid: confirmation, provider, service, support + guarantee CTA.
 * Same claim / stale / delivered pattern as seller notify to avoid duplicates and stuck rows.
 */
export async function notifyBuyerBookingCommissionPaid(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;

  const staleBefore = new Date(Date.now() - STALE_NOTIFY_CLAIM_MS).toISOString();
  const claimedAt = new Date().toISOString();

  const { data: claimedRows, error: claimErr } = await supabase
    .from("service_bookings")
    .update({ buyer_booking_paid_notify_claimed_at: claimedAt })
    .in("id", idVars)
    .eq("payment_status", "paid")
    .is("buyer_booking_paid_notified_at", null)
    .or(`buyer_booking_paid_notify_claimed_at.is.null,buyer_booking_paid_notify_claimed_at.lt.${staleBefore}`)
    .select(
      "id,buyer_id,seller_id,listing_id,note,paid_at,package_session_count,commission_amount_cents,ticket_code"
    );

  if (claimErr) {
    console.error("[buyer-booking-notify] claim", claimErr);
    return;
  }
  const row = claimedRows?.[0];
  if (!row) return;

  const releaseClaim = async () => {
    await supabase
      .from("service_bookings")
      .update({ buyer_booking_paid_notify_claimed_at: null })
      .eq("id", row.id)
      .eq("payment_status", "paid")
      .is("buyer_booking_paid_notified_at", null);
  };

  const markDelivered = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("service_bookings")
      .update({
        buyer_booking_paid_notified_at: now,
        buyer_booking_paid_notify_claimed_at: null,
      })
      .eq("id", row.id)
      .eq("payment_status", "paid");
    if (error) console.error("[buyer-booking-notify] markDelivered", error);
  };

  try {
    const listingIdVars = idMatchVariantsForIn(String(row.listing_id));
    const { data: listingRows } = await supabase
      .from("listings")
      .select("title_es")
      .in("id", listingIdVars)
      .limit(1);
    const listingTitle = listingRows?.[0]?.title_es?.trim() || "Tu servicio";

    const sellerPool = await expandUserAccountIdPool(supabase, String(row.seller_id));
    const { data: sellerRows } = await supabase
      .from("users")
      .select("display_name,phone")
      .in("id", sellerPool)
      .limit(1);
    const providerName = sellerRows?.[0]?.display_name?.trim() || "Tu proveedor";

    const buyerPool = await expandUserAccountIdPool(supabase, String(row.buyer_id));
    const { data: buyerRows } = await supabase
      .from("users")
      .select("phone")
      .in("id", buyerPool)
      .limit(1);
    const buyerPhoneRaw = buyerRows?.[0]?.phone?.trim();
    const buyerDigits = canonicalizeAuthPhone(normalizeAuthPhone(String(buyerPhoneRaw ?? "")));
    if (!buyerDigits || buyerDigits.length < 11) {
      console.warn("[buyer-booking-notify] no buyer phone", { bookingId: row.id });
      await releaseClaim();
      return;
    }

    const pkg = row.package_session_count;
    const packageLine =
      typeof pkg === "number" && pkg > 1
        ? `Plan: ${pkg} sesiones (precio acordado con el proveedor).`
        : "Servicio / reserva pagada en la app.";

    const noteLine = row.note ? `Tu mensaje al proveedor: «${truncate(String(row.note), 220)}»` : "";
    const confirmedLine = `Confirmada: ${formatConfirmedEs(row.paid_at)}`;
    const appUrl = getPublicAppUrl();
    const feeMx = Math.round((row.commission_amount_cents ?? 0) / 100);
    const supportUrl = `${appUrl}/claims`;
    const bookingUrl = `${appUrl}/booking/success?id=${row.id}`;
    const myBookingsUrl = `${appUrl}/my-bookings`;
    const ticketLine = row.ticket_code
      ? `🎫 Ticket: *${row.ticket_code}*`
      : `Referencia: ${row.id.slice(0, 8)}…`;

    const msg = [
      `✅ *Reserva confirmada — Naranjogo*`,
      ``,
      ticketLine,
      ``,
      `*${listingTitle}*`,
      packageLine,
      ``,
      `👤 Proveedor: *${providerName}*`,
      `📅 ${confirmedLine}`,
      `💳 Tarifa plataforma pagada: ~$${feeMx.toLocaleString("es-MX")} MXN`,
      ...(noteLine ? [``, noteLine] : []),
      ``,
      `Confirma fecha y hora exactas por WhatsApp con tu proveedor.`,
      ``,
      `*Garantía:* aplicación y posibles reembolsos solo si reservaste y pagaste *en Naranjogo*: ${supportUrl}`,
      ``,
      `Seguimiento (ticket + estado): ${myBookingsUrl}`,
      ``,
      `¿Dudas? Abre tu reserva: ${bookingUrl}`,
    ].join("\n");

    const ok = await sendWhatsAppToE164Digits(buyerDigits, msg);
    if (!ok) {
      console.error("[buyer-booking-notify] WhatsApp send failed", {
        bookingId: row.id,
        buyerPhonePrefix: buyerDigits.slice(0, 6),
      });
      await releaseClaim();
      return;
    }

    await markDelivered();
  } catch (e) {
    console.error("[buyer-booking-notify]", e);
    await releaseClaim();
  }
}
