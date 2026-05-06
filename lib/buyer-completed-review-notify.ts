import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { sendWhatsApp } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";

const STALE_NOTIFY_CLAIM_MS = 3 * 60 * 1000;

/**
 * One WhatsApp to the buyer after the seller marks the booking completed — link to leave a review.
 * Claim pattern avoids duplicate sends if PATCH or workers retry.
 */
export async function notifyBuyerCompletedReviewPrompt(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;

  const staleBefore = new Date(Date.now() - STALE_NOTIFY_CLAIM_MS).toISOString();
  const claimedAt = new Date().toISOString();

  const { data: claimedRows, error: claimErr } = await supabase
    .from("service_bookings")
    .update({ buyer_completed_review_notify_claimed_at: claimedAt })
    .in("id", idVars)
    .eq("payment_status", "paid")
    .eq("status", "completed")
    .is("buyer_completed_review_notified_at", null)
    .or(
      `buyer_completed_review_notify_claimed_at.is.null,buyer_completed_review_notify_claimed_at.lt.${staleBefore}`
    )
    .select("id,buyer_id,seller_id,listing_id");

  if (claimErr) {
    console.error("[buyer-completed-review-notify] claim", claimErr);
    return;
  }
  const row = claimedRows?.[0];
  if (!row) return;

  const releaseClaim = async () => {
    await supabase
      .from("service_bookings")
      .update({ buyer_completed_review_notify_claimed_at: null })
      .eq("id", row.id)
      .eq("status", "completed")
      .is("buyer_completed_review_notified_at", null);
  };

  const markDelivered = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("service_bookings")
      .update({
        buyer_completed_review_notified_at: now,
        buyer_completed_review_notify_claimed_at: null,
      })
      .eq("id", row.id)
      .eq("status", "completed");
    if (error) console.error("[buyer-completed-review-notify] markDelivered", error);
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
      .select("display_name")
      .in("id", sellerPool)
      .limit(1);
    const providerName = sellerRows?.[0]?.display_name?.trim() || "Tu proveedor";

    const buyerPool = await expandUserAccountIdPool(supabase, String(row.buyer_id));
    const { data: buyerRows } = await supabase
      .from("users")
      .select("phone")
      .in("id", buyerPool)
      .limit(1);
    const buyerPhone = buyerRows?.[0]?.phone?.trim();
    if (!buyerPhone) {
      console.warn("[buyer-completed-review-notify] no buyer phone", { bookingId: row.id });
      await releaseClaim();
      return;
    }

    const appUrl = getPublicAppUrl();
    const reviewUrl = `${appUrl}/my-bookings?review=${encodeURIComponent(row.id)}`;

    const msg = [
      `⭐ *Servicio marcado como completado — Naranjogo*`,
      ``,
      `*${listingTitle}*`,
      `Proveedor: *${providerName}*`,
      ``,
      `¿Todo bien? Ayuda a otros dejando una reseña con estrellas:`,
      reviewUrl,
      ``,
      `_Inicia sesión en Naranjogo y abre el enlace si no estás dentro de la app._`,
    ].join("\n");

    const ok = await sendWhatsApp(buyerPhone, msg);
    if (!ok) {
      console.error("[buyer-completed-review-notify] WhatsApp send failed", {
        bookingId: row.id,
        buyerPhonePrefix: buyerPhone.slice(0, 6),
      });
      await releaseClaim();
      return;
    }

    await markDelivered();
  } catch (e) {
    console.error("[buyer-completed-review-notify]", e);
    await releaseClaim();
  }
}
