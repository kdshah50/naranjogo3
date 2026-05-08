import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn, sortRowsWithPreferredUserId } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import type { BuyerPhaseWhatsAppResult } from "@/lib/buyer-phase-notify";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";

const STALE_NOTIFY_CLAIM_MS = 3 * 60 * 1000;

/**
 * One WhatsApp to the buyer after the seller marks the booking completed — link to leave a review.
 * Claim pattern avoids duplicate sends if PATCH or workers retry.
 */
export async function notifyBuyerCompletedReviewPrompt(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BuyerPhaseWhatsAppResult> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return { delivered: false, reason: "no_booking" };

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
    .select("id,buyer_id,seller_id,listing_id,ticket_code");

  if (claimErr) {
    console.error("[buyer-completed-review-notify] claim", claimErr);
    return { delivered: false, reason: "send_failed" };
  }
  const row = claimedRows?.[0];
  if (!row) {
    const { data: b } = await supabase
      .from("service_bookings")
      .select("buyer_completed_review_notified_at,status,payment_status")
      .in("id", idVars)
      .maybeSingle();
    if (!b) return { delivered: false, reason: "no_booking" };
    if (b.buyer_completed_review_notified_at) return { delivered: false, reason: "deduped" };
    if (b.payment_status !== "paid") return { delivered: false, reason: "not_paid" };
    if (b.status !== "completed") return { delivered: false, reason: "no_booking" };
    return { delivered: false, reason: "deduped" };
  }

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
    const { data: buyerRowsRaw } = await supabase.from("users").select("id,phone").in("id", buyerPool);
    const buyerRows = sortRowsWithPreferredUserId(buyerRowsRaw ?? [], String(row.buyer_id));

    let buyerDigits = "";
    for (const br of buyerRows ?? []) {
      const d = e164DigitsForWhatsAppRecipient(br?.phone);
      if (d) {
        buyerDigits = d;
        break;
      }
    }
    if (!buyerDigits) {
      console.warn("[buyer-completed-review-notify] no buyer phone on merged accounts", {
        bookingId: row.id,
        poolSize: buyerPool.length,
      });
      await releaseClaim();
      return { delivered: false, reason: "no_buyer_phone" };
    }

    if (!isTwilioWhatsAppConfigured()) {
      console.warn("[buyer-completed-review-notify] Twilio WhatsApp not configured (check TWILIO_* env)");
      await releaseClaim();
      return { delivered: false, reason: "twilio_unconfigured" };
    }

    /** Space this send from scheduled / in_progress bursts; parallel +52/+521 doubles requests → 429 without delay. */
    await new Promise((r) => setTimeout(r, 2600));

    const appUrl = getPublicAppUrl();
    const reviewUrl = `${appUrl}/my-bookings?review=${encodeURIComponent(row.id)}`;

    const ticketLine = row.ticket_code ? `Ticket: *${row.ticket_code}*` : "";

    const msg = [
      `⭐ *Servicio completado — Naranjogo*`,
      ``,
      `📌 *Estado:* Completado`,
      `📌 *Status:* Completed`,
      ``,
      ...(ticketLine ? [ticketLine, ``] : []),
      `*${listingTitle}*`,
      `Proveedor / *Provider:* *${providerName}*`,
      ``,
      `⭐ *Tu reseña ayuda a otros* — abre el enlace y valora con estrellas:`,
      `⭐ *Your review helps others* — open the link to rate:`,
      reviewUrl,
      ``,
      `_También en la app: Perfil → Mis reservas._`,
      `_In the app: Profile → My bookings._`,
    ].join("\n");

    const ok = await sendWhatsAppToE164Digits(buyerDigits, msg);
    if (!ok) {
      console.error("[buyer-completed-review-notify] WhatsApp send failed", {
        bookingId: row.id,
        buyerPhonePrefix: buyerDigits.slice(0, 6),
      });
      await releaseClaim();
      return { delivered: false, reason: "send_failed" };
    }

    await markDelivered();
    return { delivered: true };
  } catch (e) {
    console.error("[buyer-completed-review-notify]", e);
    await releaseClaim();
    return { delivered: false, reason: "send_failed" };
  }
}
