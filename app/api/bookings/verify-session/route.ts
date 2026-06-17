import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, idMatchVariantsForIn } from "@/lib/auth-server";
import { getStripe, stripePaymentIntentId } from "@/lib/stripe";
import { getPublicAppUrl } from "@/lib/app-url";
import { notifyBuyerBookingCommissionPaid } from "@/lib/buyer-booking-notify";
import { notifySellerBookingCommissionPaid } from "@/lib/seller-booking-notify";
import { appendBookingEvent, ensureTicketCodeForPaidBooking, statusAfterPaymentSucceeded } from "@/lib/booking-lifecycle";
import { appendListingChatPaymentNotice, appendListingChatPaymentNoticeForBookingId } from "@/lib/payment-confirmed-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ServiceBookingRow = Record<string, unknown> & {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  ticket_code?: string | null;
  payment_status: string;
  status: string;
  commission_amount_cents: number;
  commission_pct?: number | null;
  paid_at: string | null;
  created_at: string;
  seller_phone_snapshot?: string | null;
};

async function verifySessionResponseBody(supabase: ReturnType<typeof createAdminSupabase>, fresh: ServiceBookingRow) {
  const listingIdVars = idMatchVariantsForIn(String(fresh.listing_id));
  const { data: listing } = await supabase
    .from("listings")
    .select("title_es,photo_urls,price_mxn")
    .in("id", listingIdVars)
    .maybeSingle();

  const freshSellerIdVars = idMatchVariantsForIn(String(fresh.seller_id));
  const { data: seller } = await supabase
    .from("users")
    .select("display_name,avatar_url,phone,whatsapp_optin")
    .in("id", freshSellerIdVars)
    .maybeSingle();

  const isPaid = fresh.payment_status === "paid";
  const phone = isPaid ? (fresh.seller_phone_snapshot || seller?.phone) : null;
  const waDigits = phone?.replace(/\D/g, "") ?? "";
  const waUrl =
    isPaid && waDigits
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
          `Hola! Ya reservé tu servicio "${listing?.title_es ?? ""}" en Naranjogo.`,
        )}`
      : null;

  const appUrl = getPublicAppUrl();

  return {
    id: fresh.id,
    listingId: fresh.listing_id,
    ticketCode: fresh.ticket_code ?? null,
    paymentStatus: fresh.payment_status,
    status: fresh.status,
    commissionAmountCents: fresh.commission_amount_cents,
    commissionPct: fresh.commission_pct,
    paidAt: fresh.paid_at,
    createdAt: fresh.created_at,
    isBuyer: true,
    tracking: {
      buyerBookingsUrl: `${appUrl}/my-bookings`,
      sellerBookingsUrl: `${appUrl}/seller-bookings`,
      listingUrl: `${appUrl}/listing/${fresh.listing_id}`,
      claimsUrl: `${appUrl}/claims?booking=${encodeURIComponent(fresh.id)}`,
    },
    listing: listing
      ? {
          title: listing.title_es,
          photo: listing.photo_urls?.[0] ?? null,
          priceMxn: listing.price_mxn,
        }
      : null,
    seller: seller
      ? {
          displayName: seller.display_name,
          avatarUrl: seller.avatar_url,
        }
      : null,
    contact: isPaid ? { whatsappUrl: waUrl } : null,
  };
}

const sessionJsonHeaders = { "Cache-Control": "no-store, max-age=0" as const };

/**
 * GET ?session_id=cs_xxx
 * Loads booking after Stripe Checkout without requiring auth cookie (fixes post-payment 401
 * when returning from checkout.stripe.com or www/non-www cookie mismatch).
 * Verifies the session with Stripe, syncs DB if webhook has not run yet.
 * Loyalty points are left to the webhook only to avoid double-award.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim() ?? "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "session_id inválido" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    const bookingIdFromMeta = checkoutSession.metadata?.booking_id?.trim() ?? "";
    if (!bookingIdFromMeta) {
      return NextResponse.json({ error: "Sesión sin reserva" }, { status: 404 });
    }

    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(String(bookingIdFromMeta));
    const { data: booking } = await supabase
      .from("service_bookings")
      .select("*")
      .in("id", idVars)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const sessionPaid = checkoutSession.payment_status === "paid";

    /**
     * Stripe’s session can briefly lag `checkout.session.completed` / bank capture while the user
     * already landed on success_url. Returning 402 made the success page treat it as fatal and
     * stopped polling — users saw “could not load booking” with a working payment.
     */
    if (!sessionPaid && booking.payment_status === "pending") {
      return NextResponse.json(await verifySessionResponseBody(supabase, booking as ServiceBookingRow), {
        headers: sessionJsonHeaders,
      });
    }

    const bookingRowId = booking.id;

    if (booking.payment_status !== "paid") {
      const now = new Date().toISOString();
      const sellerIdVars = idMatchVariantsForIn(String(booking.seller_id));
      const { data: seller } = await supabase
        .from("users")
        .select("phone")
        .in("id", sellerIdVars)
        .maybeSingle();

      const intentId = stripePaymentIntentId(checkoutSession.payment_intent);
      const nextStatus = statusAfterPaymentSucceeded(booking.status);

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
        .in("id", idVars)
        .eq("payment_status", "pending")
        .neq("status", "cancelled")
        .select("id");

      if (upErr) {
        console.error("[verify-session] booking update", upErr);
        return NextResponse.json({ error: "No se pudo confirmar la reserva" }, { status: 500 });
      }

      if (updatedRows?.length) {
        try {
          await ensureTicketCodeForPaidBooking(supabase, bookingRowId);
        } catch (tcErr) {
          console.error("[verify-session] ticket_code (non-fatal)", tcErr);
        }
        try {
          await appendListingChatPaymentNoticeForBookingId(supabase, bookingRowId);
        } catch (chatErr) {
          console.error("[verify-session] payment-confirmed-chat early (non-fatal)", chatErr);
        }
        try {
          await appendBookingEvent(supabase, {
            bookingId: bookingRowId,
            actorId: null,
            eventType: "payment_confirmed",
            fromStatus: String(booking.status ?? "pending"),
            toStatus: nextStatus,
            meta: { source: "verify_session" },
          });
        } catch (evErr) {
          console.error("[verify-session] booking_events (non-fatal)", evErr);
        }

        try {
          await notifySellerBookingCommissionPaid(supabase, bookingRowId);
        } catch (notifyErr) {
          console.error("[verify-session] seller booking notify failed (non-fatal)", notifyErr);
        }
      } else {
        const { data: racedPaid } = await supabase
          .from("service_bookings")
          .select("payment_status")
          .in("id", idVars)
          .maybeSingle();
        if (racedPaid?.payment_status !== "paid") {
          console.error("[verify-session] update matched 0 rows for booking", bookingRowId);
          return NextResponse.json({ error: "No se pudo confirmar la reserva" }, { status: 500 });
        }
        try {
          await ensureTicketCodeForPaidBooking(supabase, bookingRowId);
        } catch (tcErr) {
          console.error("[verify-session] ticket_code race (non-fatal)", tcErr);
        }
        try {
          await appendListingChatPaymentNoticeForBookingId(supabase, bookingRowId);
        } catch (chatErr) {
          console.error("[verify-session] payment-confirmed-chat race (non-fatal)", chatErr);
        }
        try {
          await notifySellerBookingCommissionPaid(supabase, bookingRowId);
        } catch (notifyErr) {
          console.error("[verify-session] seller booking notify race (non-fatal)", notifyErr);
        }
      }
    } else {
      try {
        await ensureTicketCodeForPaidBooking(supabase, bookingRowId);
      } catch (tcErr) {
        console.error("[verify-session] ticket_code existing paid (non-fatal)", tcErr);
      }
      try {
        await notifySellerBookingCommissionPaid(supabase, bookingRowId);
      } catch (notifyErr) {
        console.error("[verify-session] seller booking notify failed (non-fatal)", notifyErr);
      }
    }

    try {
      await notifyBuyerBookingCommissionPaid(supabase, bookingRowId);
    } catch (notifyErr) {
      console.error("[verify-session] buyer booking notify failed (non-fatal)", notifyErr);
    }

    const { data: fresh } = await supabase
      .from("service_bookings")
      .select("*")
      .in("id", idVars)
      .maybeSingle();

    if (!fresh) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (fresh.payment_status === "paid") {
      try {
        await appendListingChatPaymentNotice(supabase, {
          id: String(fresh.id),
          listing_id: String(fresh.listing_id),
          buyer_id: String(fresh.buyer_id),
          ticket_code: (fresh.ticket_code as string | null) ?? null,
        });
      } catch (chatErr) {
        console.error("[verify-session] payment-confirmed-chat (non-fatal)", chatErr);
      }
    }

    return NextResponse.json(await verifySessionResponseBody(supabase, fresh as ServiceBookingRow), {
      headers: sessionJsonHeaders,
    });
  } catch (e) {
    console.error("[verify-session] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
