import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { isSameUserId, idMatchVariantsForIn } from "@/lib/auth-server";
import { stripePaymentIntentId } from "@/lib/stripe";
import { awardPoints } from "@/lib/loyalty";
import { maybeAwardReferralBonus } from "@/lib/referral";
import { notifyBuyerBookingCommissionPaid } from "@/lib/buyer-booking-notify";
import { notifySellerBookingCommissionPaid } from "@/lib/seller-booking-notify";
import { appendBookingEvent, ensureTicketCodeForPaidBooking } from "@/lib/booking-lifecycle";

export type ReconcileResult = "synced" | "skipped" | "error";

type PendingRow = { id: string; stripe_checkout_session_id: string; buyer_id: string };

/**
 * If Stripe shows paid but our row is still pending, mark paid and run loyalty/referral
 * (webhook/verify-session may have missed). Update is conditional on payment_status = pending
 * to avoid double-awarding on races.
 */
export async function reconcileOneCheckoutSession(
  supabase: SupabaseClient,
  stripe: Stripe,
  row: PendingRow
): Promise<ReconcileResult> {
  const sessionId = row.stripe_checkout_session_id?.trim() ?? "";
  if (!sessionId.startsWith("cs_")) return "skipped";

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error("[reconcile] stripe.retrieve", sessionId, e);
    return "error";
  }

  if (session.payment_status !== "paid") return "skipped";

  const metaBid = session.metadata?.booking_id?.trim() ?? "";
  if (!metaBid || !isSameUserId(String(row.id), metaBid)) {
    return "skipped";
  }

  const idVars = idMatchVariantsForIn(String(row.id));
  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id, payment_status, buyer_id, seller_id")
    .in("id", idVars)
    .maybeSingle();

  if (!booking) return "skipped";
  if (booking.payment_status === "paid") return "skipped";

  const now = new Date().toISOString();
  const sellerIdVars = idMatchVariantsForIn(String(booking.seller_id));
  const { data: seller } = await supabase
    .from("users")
    .select("phone")
    .in("id", sellerIdVars)
    .maybeSingle();

  const intentId = stripePaymentIntentId(session.payment_intent);

  const { data: updatedRows, error: upErr } = await supabase
    .from("service_bookings")
    .update({
      payment_status: "paid",
      ...(intentId ? { stripe_payment_intent_id: intentId } : {}),
      paid_at: now,
      seller_phone_snapshot: seller?.phone ?? null,
      contact_revealed_at: now,
      status: "confirmed",
      updated_at: now,
    })
    .in("id", idVars)
    .eq("payment_status", "pending")
    .neq("status", "cancelled")
    .select("id");

  if (upErr) {
    console.error("[reconcile] update", upErr);
    return "error";
  }
  if (!updatedRows?.length) {
    return "skipped";
  }

  try {
    await ensureTicketCodeForPaidBooking(supabase, String(booking.id));
  } catch (e) {
    console.error("[reconcile] ticket_code (non-fatal)", e);
  }
  try {
    await appendBookingEvent(supabase, {
      bookingId: String(booking.id),
      actorId: null,
      eventType: "payment_confirmed",
      fromStatus: "pending",
      toStatus: "confirmed",
      meta: { source: "reconcile_cron" },
    });
  } catch (e) {
    console.error("[reconcile] booking_events (non-fatal)", e);
  }

  const buyerId = (session.metadata?.buyer_id?.trim() || booking.buyer_id).trim();
  const amountPaid = session.amount_total ?? 0;
  if (buyerId && amountPaid > 0) {
    try {
      await awardPoints(supabase, buyerId, String(booking.id), amountPaid);
    } catch (e) {
      console.error("[reconcile] loyalty", e);
    }
    try {
      await maybeAwardReferralBonus(supabase, buyerId, String(booking.id));
    } catch (e) {
      console.error("[reconcile] referral", e);
    }
  }

  try {
    await notifySellerBookingCommissionPaid(supabase, String(booking.id));
  } catch (e) {
    console.error("[reconcile] seller booking notify", e);
  }

  try {
    await notifyBuyerBookingCommissionPaid(supabase, String(booking.id));
  } catch (e) {
    console.error("[reconcile] buyer booking notify", e);
  }

  return "synced";
}
