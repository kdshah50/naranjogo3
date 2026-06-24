import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";
import { awardPoints } from "@/lib/loyalty";
import { maybeAwardReferralBonus } from "@/lib/referral";
import { notifyBuyerBookingCommissionPaid } from "@/lib/buyer-booking-notify";
import { notifySellerBookingCommissionPaid } from "@/lib/seller-booking-notify";
import {
  appendBookingEvent,
  ensureTicketCodeForPaidBooking,
  statusAfterPaymentSucceeded,
} from "@/lib/booking-lifecycle";
import {
  appendListingChatPaymentNotice,
  appendListingChatPaymentNoticeForBookingId,
} from "@/lib/payment-confirmed-chat";

export type FinalizeDepositPaidSource = "verify_session" | "stripe_webhook" | "wallet_checkout";

export type FinalizeDepositPaidResult =
  | { ok: true; wasNewlyPaid: boolean; bookingRowId: string }
  | { ok: false; error: string };

async function runPaidSideEffects(
  supabase: SupabaseClient,
  bookingRowId: string,
  fromStatus: string,
  nextStatus: string,
  source: FinalizeDepositPaidSource,
): Promise<void> {
  try {
    await ensureTicketCodeForPaidBooking(supabase, bookingRowId);
  } catch (tcErr) {
    console.error(`[deposit-paid:${source}] ticket_code (non-fatal)`, tcErr);
  }
  try {
    await appendListingChatPaymentNoticeForBookingId(supabase, bookingRowId);
  } catch (chatErr) {
    console.error(`[deposit-paid:${source}] payment-confirmed-chat early (non-fatal)`, chatErr);
  }
  try {
    await appendBookingEvent(supabase, {
      bookingId: bookingRowId,
      actorId: null,
      eventType: "payment_confirmed",
      fromStatus,
      toStatus: nextStatus,
      meta: { source },
    });
  } catch (evErr) {
    console.error(`[deposit-paid:${source}] booking_events (non-fatal)`, evErr);
  }
  try {
    await notifySellerBookingCommissionPaid(supabase, bookingRowId);
  } catch (notifyErr) {
    console.error(`[deposit-paid:${source}] seller notify (non-fatal)`, notifyErr);
  }
}

/**
 * Mark a pending service booking deposit as paid and run post-payment side effects.
 * Safe to call on replay (Stripe webhook, wallet idempotency, verify-session poll).
 */
export async function finalizeServiceBookingDepositPaid(
  supabase: SupabaseClient,
  args: {
    bookingId: string;
    source: FinalizeDepositPaidSource;
    stripePaymentIntentId?: string | null;
  },
): Promise<FinalizeDepositPaidResult> {
  const bookingIdVars = idMatchVariantsForIn(String(args.bookingId).trim());
  if (bookingIdVars.length === 0) {
    return { ok: false, error: "bookingId required" };
  }

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,status,payment_status,seller_id,buyer_id,listing_id,ticket_code,commission_amount_cents")
    .in("id", bookingIdVars)
    .maybeSingle();

  if (!booking) {
    return { ok: false, error: "Reserva no encontrada" };
  }

  const bookingRowId = String(booking.id);
  const fromStatus = String(booking.status ?? "pending");

  if (booking.payment_status === "paid") {
    try {
      await ensureTicketCodeForPaidBooking(supabase, bookingRowId);
    } catch {
      /* non-fatal */
    }
    try {
      await notifySellerBookingCommissionPaid(supabase, bookingRowId);
    } catch {
      /* non-fatal */
    }
    try {
      await notifyBuyerBookingCommissionPaid(supabase, bookingRowId);
    } catch {
      /* non-fatal */
    }
    try {
      await appendListingChatPaymentNotice(supabase, {
        id: bookingRowId,
        listing_id: String(booking.listing_id),
        buyer_id: String(booking.buyer_id),
        ticket_code: (booking.ticket_code as string | null) ?? null,
      });
    } catch {
      /* non-fatal */
    }
    return { ok: true, wasNewlyPaid: false, bookingRowId };
  }

  const now = new Date().toISOString();
  const sellerIdVars = idMatchVariantsForIn(String(booking.seller_id));
  const { data: seller } = await supabase
    .from("users")
    .select("phone")
    .in("id", sellerIdVars)
    .maybeSingle();

  const nextStatus = statusAfterPaymentSucceeded(booking.status);
  const intentId = args.stripePaymentIntentId?.trim() || null;

  const { data: updatedRows, error: upErr } = await supabase
    .from("service_bookings")
    .update({
      payment_status: "paid",
      ...(intentId ? { stripe_payment_intent_id: intentId } : {}),
      paid_at: now,
      seller_phone_snapshot: seller?.phone ?? null,
      contact_revealed_at: now,
      status: nextStatus,
      updated_at: now,
    })
    .in("id", bookingIdVars)
    .eq("payment_status", "pending")
    .neq("status", "cancelled")
    .select("id");

  if (upErr) {
    console.error(`[deposit-paid:${args.source}] booking update`, upErr);
    return { ok: false, error: "No se pudo confirmar la reserva" };
  }

  let wasNewlyPaid = Boolean(updatedRows?.length);

  if (wasNewlyPaid) {
    await runPaidSideEffects(supabase, bookingRowId, fromStatus, nextStatus, args.source);
  } else {
    const { data: racedPaid } = await supabase
      .from("service_bookings")
      .select("payment_status")
      .in("id", bookingIdVars)
      .maybeSingle();
    if (racedPaid?.payment_status !== "paid") {
      return { ok: false, error: "No se pudo confirmar la reserva" };
    }
    await runPaidSideEffects(supabase, bookingRowId, fromStatus, nextStatus, args.source);
  }

  try {
    await notifyBuyerBookingCommissionPaid(supabase, bookingRowId);
  } catch (notifyErr) {
    console.error(`[deposit-paid:${args.source}] buyer notify (non-fatal)`, notifyErr);
  }

  const { data: fresh } = await supabase
    .from("service_bookings")
    .select("id,listing_id,buyer_id,ticket_code,payment_status,commission_amount_cents")
    .in("id", bookingIdVars)
    .maybeSingle();

  if (fresh?.payment_status === "paid") {
    try {
      await appendListingChatPaymentNotice(supabase, {
        id: String(fresh.id),
        listing_id: String(fresh.listing_id),
        buyer_id: String(fresh.buyer_id),
        ticket_code: (fresh.ticket_code as string | null) ?? null,
      });
    } catch (chatErr) {
      console.error(`[deposit-paid:${args.source}] payment-confirmed-chat (non-fatal)`, chatErr);
    }
  }

  if (wasNewlyPaid && args.source !== "verify_session") {
    const buyerId = String(booking.buyer_id ?? "");
    const amountPaid = Number(fresh?.commission_amount_cents ?? booking.commission_amount_cents ?? 0);
    if (buyerId && amountPaid > 0) {
      try {
        await awardPoints(supabase, buyerId, bookingRowId, amountPaid);
      } catch (loyaltyErr) {
        console.error(`[deposit-paid:${args.source}] loyalty (non-fatal)`, loyaltyErr);
      }
      try {
        await maybeAwardReferralBonus(supabase, buyerId, bookingRowId);
      } catch (refErr) {
        console.error(`[deposit-paid:${args.source}] referral (non-fatal)`, refErr);
      }
    }
  }

  return { ok: true, wasNewlyPaid, bookingRowId };
}
