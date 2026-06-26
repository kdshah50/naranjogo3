import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, idMatchVariantsForIn } from "@/lib/auth-server";
import { getStripe, stripePaymentIntentId } from "@/lib/stripe";
import { getPublicAppUrl } from "@/lib/app-url";
import { finalizeServiceBookingDepositPaid } from "@/lib/service-booking-deposit-paid";

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

async function verifySessionResponseBody(
  supabase: ReturnType<typeof createAdminSupabase>,
  fresh: ServiceBookingRow,
  checkoutPaymentStatus?: string | null,
) {
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
  const ticketCode = fresh.ticket_code ?? null;

  return {
    id: fresh.id,
    listingId: fresh.listing_id,
    ticketCode,
    paymentStatus: fresh.payment_status,
    checkoutPaymentStatus: checkoutPaymentStatus ?? null,
    status: fresh.status,
    commissionAmountCents: fresh.commission_amount_cents,
    commissionPct: fresh.commission_pct,
    paidAt: fresh.paid_at,
    createdAt: fresh.created_at,
    isBuyer: true,
    tracking: {
      buyerBookingsUrl: ticketCode
        ? `${appUrl}/my-bookings?ticket=${encodeURIComponent(String(ticketCode))}`
        : `${appUrl}/my-bookings`,
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

    const sessionPaid = checkoutSession.payment_status === "paid";

    if (sessionPaid) {
      const fin = await finalizeServiceBookingDepositPaid(supabase, {
        bookingId: bookingIdFromMeta,
        source: "verify_session",
        stripePaymentIntentId: stripePaymentIntentId(checkoutSession.payment_intent),
      });
      if (!fin.ok) {
        console.error("[verify-session] finalize", fin.error);
        return NextResponse.json({ error: fin.error }, { status: 500 });
      }
    }

    const { data: fresh } = await supabase
      .from("service_bookings")
      .select("*")
      .in("id", idVars)
      .maybeSingle();

    if (!fresh) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    return NextResponse.json(
      await verifySessionResponseBody(
        supabase,
        fresh as ServiceBookingRow,
        checkoutSession.payment_status,
      ),
      { headers: sessionJsonHeaders },
    );
  } catch (e) {
    console.error("[verify-session] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
