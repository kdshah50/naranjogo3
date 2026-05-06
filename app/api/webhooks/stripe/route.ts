import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, idMatchVariantsForIn } from "@/lib/auth-server";
import { getStripe, stripePaymentIntentId } from "@/lib/stripe";
import { awardPoints } from "@/lib/loyalty";
import { maybeAwardReferralBonus } from "@/lib/referral";
import { notifyBuyerBookingCommissionPaid } from "@/lib/buyer-booking-notify";
import { notifySellerBookingCommissionPaid } from "@/lib/seller-booking-notify";
import { appendBookingEvent, ensureTicketCodeForPaidBooking } from "@/lib/booking-lifecycle";
import { appendListingChatPaymentNotice } from "@/lib/payment-confirmed-chat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const supabase = createAdminSupabase();
    const now = new Date().toISOString();
    const intentId = stripePaymentIntentId(session.payment_intent);

    if (session.metadata?.order_kind === "marketplace" && session.metadata?.marketplace_order_id) {
      const orderId = session.metadata.marketplace_order_id;
      const { error: ordErr } = await supabase
        .from("marketplace_orders")
        .update({
          status: "paid",
          ...(intentId ? { stripe_payment_intent_id: intentId } : {}),
          updated_at: now,
        })
        .eq("id", orderId);

      if (ordErr) {
        console.error("[stripe-webhook] marketplace_order update failed", ordErr);
        return NextResponse.json({ error: "Persist failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    const bookingIdMeta = session.metadata?.booking_id?.trim() ?? "";
    if (!bookingIdMeta) {
      console.error("[stripe-webhook] No booking_id or marketplace_order in metadata");
      return NextResponse.json({ received: true });
    }
    const bookingIdVars = idMatchVariantsForIn(bookingIdMeta);

    const sellerIdMeta = session.metadata?.seller_id?.trim() ?? "";
    const sellerIdVars = sellerIdMeta ? idMatchVariantsForIn(sellerIdMeta) : [];
    const { data: seller } =
      sellerIdVars.length > 0
        ? await supabase.from("users").select("phone").in("id", sellerIdVars).maybeSingle()
        : { data: null as { phone: string | null } | null };

    const { data: bookingPaySynced, error: upErr } = await supabase
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
      .in("id", bookingIdVars)
      .neq("status", "cancelled")
      .select("id");

    if (upErr) {
      console.error("[stripe-webhook] booking update failed", upErr);
      return NextResponse.json({ error: "Persist failed" }, { status: 500 });
    }

    if (!bookingPaySynced?.length) {
      return NextResponse.json({ received: true });
    }

    try {
      await ensureTicketCodeForPaidBooking(supabase, bookingIdMeta);
    } catch (tcErr) {
      console.error("[stripe-webhook] ticket_code (non-fatal)", tcErr);
    }

    try {
      await appendBookingEvent(supabase, {
        bookingId: bookingIdMeta,
        actorId: null,
        eventType: "payment_confirmed",
        fromStatus: "pending",
        toStatus: "confirmed",
        meta: { source: "stripe_webhook" },
      });
    } catch (evErr) {
      console.error("[stripe-webhook] booking_events (non-fatal)", evErr);
    }

    try {
      await notifySellerBookingCommissionPaid(supabase, bookingIdMeta);
    } catch (notifyErr) {
      console.error("[stripe-webhook] seller booking notify failed (non-fatal)", notifyErr);
    }

    try {
      await notifyBuyerBookingCommissionPaid(supabase, bookingIdMeta);
    } catch (notifyErr) {
      console.error("[stripe-webhook] buyer booking notify failed (non-fatal)", notifyErr);
    }

    try {
      const { data: bRow } = await supabase
        .from("service_bookings")
        .select("id,listing_id,buyer_id,ticket_code")
        .in("id", bookingIdVars)
        .maybeSingle();
      if (bRow) await appendListingChatPaymentNotice(supabase, bRow);
    } catch (chatErr) {
      console.error("[stripe-webhook] payment-confirmed-chat (non-fatal)", chatErr);
    }

    const buyerId = session.metadata?.buyer_id;
    const amountPaid = session.amount_total;
    if (buyerId && amountPaid && amountPaid > 0) {
      try {
        await awardPoints(supabase, buyerId, bookingIdMeta, amountPaid);
      } catch (loyaltyErr) {
        console.error("[stripe-webhook] loyalty award failed (non-fatal)", loyaltyErr);
      }
      try {
        await maybeAwardReferralBonus(supabase, buyerId, bookingIdMeta);
      } catch (refErr) {
        console.error("[stripe-webhook] referral bonus failed (non-fatal)", refErr);
      }
    }
  }

  return NextResponse.json({ received: true });
}
