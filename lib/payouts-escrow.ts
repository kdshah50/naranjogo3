/**
 * Helpers for the escrow payout flow (parked behind PAYOUTS_ESCROW_ENABLED).
 *
 * Flow when enabled:
 *   1. Buyer pays full subtotal + commission + IVA via Stripe Checkout
 *      (`full_connect` mode). The PaymentIntent does NOT carry
 *      `transfer_data.destination`, so funds settle into the platform's
 *      Stripe balance.
 *   2. The booking row is created with `payout_status='pending'` and
 *      `payout_amount_mxn_cents` = subtotal_mxn_cents (seller's share).
 *   3. When the seller marks the booking `completed`:
 *        - If PAYOUTS_HOLD_HOURS = 0, immediately call `releasePayout(...)`
 *          which posts `stripe.transfers.create(...)` to the seller's
 *          Connect account.
 *        - Otherwise, set `payout_release_after = now + HOLD_HOURS` and let
 *          `/api/cron/release-payouts` pick it up later.
 *   4. On cancellation, if `payout_status === 'pending'` (no transfer yet)
 *      we refund the buyer's PaymentIntent and set
 *      `payout_status='refunded'`. If it's already `'transferred'`, we set
 *      `'refund_blocked'` so admin can resolve manually.
 *
 * The flag check (`isEscrowEnabled()`) is the only gate. As long as it's
 * false (the default), all of this code is dormant — checkout falls back
 * to the existing instant-split `full_connect` path.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { getStripe } from "@/lib/stripe";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";

/** Master switch. When false, the rest of this file is effectively dead code. */
export function isEscrowEnabled(): boolean {
  return String(process.env.PAYOUTS_ESCROW_ENABLED ?? "").toLowerCase() === "true";
}

/** Hours between Completed and actual transfer (buyer dispute window). 0 = immediate. */
export function getPayoutHoldHours(): number {
  const raw = Number(process.env.PAYOUTS_HOLD_HOURS ?? "0");
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 240); // 10-day max cap, sanity bound
}

/** Compute when the payout becomes eligible (after the hold). */
export function computePayoutReleaseAfter(nowMs: number = Date.now()): string {
  const hours = getPayoutHoldHours();
  return new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
}

export type BookingPayoutRow = {
  id: string;
  seller_id: string;
  buyer_id: string;
  subtotal_mxn_cents: number | null;
  total_charged_mxn_cents: number | null;
  payout_amount_mxn_cents: number | null;
  payout_status: string | null;
  payout_transfer_id: string | null;
  payout_release_after: string | null;
  checkout_mode: string | null;
  payment_status: string | null;
  stripe_checkout_session_id: string | null;
};

/**
 * Marks a paid booking as eligible for release. Called when the seller
 * transitions the booking to `completed`. Returns the next state:
 *   - 'released_now': hold is 0, caller should immediately invoke `releasePayout`.
 *   - 'scheduled':    release_after set; the cron will pick it up later.
 *   - 'skipped':      not eligible (wrong mode, already paid out, missing data).
 */
export async function markPayoutEligibleOnCompletion(
  supabase: SupabaseClient,
  booking: BookingPayoutRow,
): Promise<"released_now" | "scheduled" | "skipped"> {
  if (!isEscrowEnabled()) return "skipped";
  if (booking.checkout_mode !== "full_connect") return "skipped";
  if (booking.payment_status !== "paid") return "skipped";
  if (booking.payout_status && booking.payout_status !== "pending") return "skipped";
  const amount = booking.payout_amount_mxn_cents ?? booking.subtotal_mxn_cents;
  if (!amount || amount <= 0) return "skipped";

  const hours = getPayoutHoldHours();
  const releaseAfter = computePayoutReleaseAfter();
  const update: Record<string, unknown> = {
    payout_release_after: releaseAfter,
    updated_at: new Date().toISOString(),
  };
  if (!booking.payout_status) {
    update.payout_status = "pending";
  }
  if (!booking.payout_amount_mxn_cents) {
    update.payout_amount_mxn_cents = amount;
  }
  const { error } = await supabase
    .from("service_bookings")
    .update(update)
    .eq("id", booking.id);
  if (error) {
    console.error("[payouts-escrow] markPayoutEligibleOnCompletion update", error);
    return "skipped";
  }
  return hours === 0 ? "released_now" : "scheduled";
}

/**
 * Calls `stripe.transfers.create(...)` to move the seller's share from the
 * platform balance to their Connect account. Updates the booking row with
 * the resulting transfer id / status / timestamp. Idempotent on the row
 * (won't double-pay if `payout_status === 'transferred'`).
 */
export async function releasePayout(
  supabase: SupabaseClient,
  booking: BookingPayoutRow,
): Promise<
  | { ok: true; transferId: string }
  | { ok: false; reason: string }
> {
  if (!isEscrowEnabled()) return { ok: false, reason: "escrow_disabled" };
  if (booking.payout_status === "transferred") {
    return { ok: true, transferId: booking.payout_transfer_id ?? "" };
  }
  if (booking.checkout_mode !== "full_connect") return { ok: false, reason: "wrong_mode" };
  if (booking.payment_status !== "paid") return { ok: false, reason: "not_paid" };

  const connectId = await loadSellerConnectId(supabase, booking.seller_id);
  if (!connectId) {
    await supabase
      .from("service_bookings")
      .update({
        payout_status: "failed",
        payout_error: "seller has no Stripe Connect account",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    return { ok: false, reason: "no_connect_account" };
  }
  const amount = booking.payout_amount_mxn_cents ?? booking.subtotal_mxn_cents;
  if (!amount || amount <= 0) return { ok: false, reason: "no_amount" };

  // Mark releasing first; if the create call fails we'll set 'failed' below.
  await supabase
    .from("service_bookings")
    .update({ payout_status: "releasing", updated_at: new Date().toISOString() })
    .eq("id", booking.id);

  const stripe = getStripe();
  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create({
      amount,
      currency: "mxn",
      destination: connectId,
      transfer_group: `booking_${booking.id}`,
      metadata: {
        booking_id: booking.id,
        seller_id: booking.seller_id,
        buyer_id: booking.buyer_id,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payouts-escrow] stripe.transfers.create failed", e);
    await supabase
      .from("service_bookings")
      .update({
        payout_status: "failed",
        payout_error: msg.slice(0, 240),
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    return { ok: false, reason: "stripe_error" };
  }

  await supabase
    .from("service_bookings")
    .update({
      payout_status: "transferred",
      payout_transfer_id: transfer.id,
      payout_completed_at: new Date().toISOString(),
      payout_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);

  return { ok: true, transferId: transfer.id };
}

/**
 * On cancellation: if the buyer was charged but seller hasn't been paid out
 * yet, refund the buyer in full and mark `refunded`. If the transfer already
 * happened, mark `refund_blocked` so admin intervenes.
 */
export async function refundOnCancellation(
  supabase: SupabaseClient,
  booking: BookingPayoutRow,
): Promise<
  | { ok: true; action: "refunded" | "refund_blocked" | "no_charge" }
  | { ok: false; reason: string }
> {
  if (!isEscrowEnabled()) return { ok: true, action: "no_charge" };
  if (booking.checkout_mode !== "full_connect") return { ok: true, action: "no_charge" };
  if (booking.payment_status !== "paid") return { ok: true, action: "no_charge" };

  if (booking.payout_status === "transferred") {
    await supabase
      .from("service_bookings")
      .update({
        payout_status: "refund_blocked",
        payout_error: "transfer already sent; manual reversal required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    return { ok: true, action: "refund_blocked" };
  }

  // Refund via the Checkout Session's PaymentIntent.
  if (!booking.stripe_checkout_session_id) {
    return { ok: false, reason: "no_session_id" };
  }
  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
  } catch (e) {
    console.error("[payouts-escrow] retrieve session failed", e);
    return { ok: false, reason: "session_retrieve_failed" };
  }
  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (!pi) return { ok: false, reason: "no_payment_intent" };

  try {
    await stripe.refunds.create({ payment_intent: pi });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[payouts-escrow] refund failed", e);
    await supabase
      .from("service_bookings")
      .update({
        payout_status: "failed",
        payout_error: msg.slice(0, 240),
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    return { ok: false, reason: "stripe_refund_error" };
  }

  await supabase
    .from("service_bookings")
    .update({
      payout_status: "refunded",
      payout_completed_at: new Date().toISOString(),
      payout_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);
  return { ok: true, action: "refunded" };
}

/**
 * Fetch the row in the shape `releasePayout` / `refundOnCancellation` need.
 * Tolerates the booking-id variants pattern used elsewhere in the app.
 */
export async function loadBookingForPayout(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingPayoutRow | null> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return null;
  const { data } = await supabase
    .from("service_bookings")
    .select(
      "id,seller_id,buyer_id,subtotal_mxn_cents,total_charged_mxn_cents,payout_amount_mxn_cents,payout_status,payout_transfer_id,payout_release_after,checkout_mode,payment_status,stripe_checkout_session_id",
    )
    .in("id", idVars)
    .maybeSingle();
  return (data as BookingPayoutRow | null) ?? null;
}
