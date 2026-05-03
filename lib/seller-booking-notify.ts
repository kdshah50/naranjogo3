import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { sendWhatsApp } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";

/**
 * One WhatsApp to the provider when a buyer pays the service/contact fee.
 * Atomically sets seller_booking_paid_notified_at before send so webhook + verify-session do not duplicate.
 * Clears the timestamp if there is no seller phone or send fails so a later retry can run.
 */
export async function notifySellerBookingCommissionPaid(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  const claimedAt = new Date().toISOString();

  const { data: claimedRows, error: claimErr } = await supabase
    .from("service_bookings")
    .update({ seller_booking_paid_notified_at: claimedAt })
    .in("id", idVars)
    .eq("payment_status", "paid")
    .is("seller_booking_paid_notified_at", null)
    .select("id,buyer_id,seller_id,listing_id,commission_amount_cents");

  if (claimErr) {
    console.error("[seller-booking-notify] claim", claimErr);
    return;
  }
  const row = claimedRows?.[0];
  if (!row) return;

  const clearClaim = async () => {
    await supabase
      .from("service_bookings")
      .update({ seller_booking_paid_notified_at: null })
      .eq("id", row.id)
      .eq("payment_status", "paid");
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

    const sellerPool = await expandUserAccountIdPool(supabase, String(row.seller_id));
    const { data: sellerRows } = await supabase
      .from("users")
      .select("phone,display_name")
      .in("id", sellerPool)
      .limit(1);
    const sellerPhone = sellerRows?.[0]?.phone?.trim();
    if (!sellerPhone) {
      console.warn("[seller-booking-notify] no seller phone", { bookingId: row.id, sellerPoolLen: sellerPool.length });
      await clearClaim();
      return;
    }

    const mxn = Math.round((row.commission_amount_cents ?? 0) / 100);
    const appUrl = getPublicAppUrl();
    const listingUrl = `${appUrl}/listing/${row.listing_id}`;

    const msg = [
      `🎉 *Pago recibido en Naranjogo*`,
      ``,
      `Un cliente pagó la tarifa de servicio/contacto por:`,
      `*${listingTitle}*`,
      ``,
      `Cliente: ${buyerName}`,
      `Tarifa plataforma: ~$${mxn.toLocaleString("es-MX")} MXN`,
      ``,
      `Abre el anuncio para ver mensajes en la app:`,
      listingUrl,
    ].join("\n");

    const ok = await sendWhatsApp(sellerPhone, msg);
    if (!ok) {
      console.error("[seller-booking-notify] WhatsApp send failed", {
        bookingId: row.id,
        sellerPhonePrefix: sellerPhone.slice(0, 6),
      });
      await clearClaim();
    }
  } catch (e) {
    console.error("[seller-booking-notify]", e);
    await clearClaim();
  }
}
