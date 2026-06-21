import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { getStripe } from "@/lib/stripe";
import { getPublicAppUrl } from "@/lib/app-url";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";
import { listingProviderSlug, listingSupportsSupplementPayments, tipPayable } from "@/lib/housekeeping-payments";
import { supplementCheckoutServiceLabel, supplementTipDescription } from "@/lib/service-quote-vertical";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = getPublicAppUrl();
const MAX_TIP_CENTS = 500_000;

/** POST { tipMxnCents } — optional tip after balance paid (housekeeping + veterinary). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const bookingId = params.id?.trim();
    if (!bookingId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const json = await req.json().catch(() => ({}));
    const tipMxnCents = Math.round(Number((json as { tipMxnCents?: unknown }).tipMxnCents));

    if (!Number.isFinite(tipMxnCents) || tipMxnCents < 100 || tipMxnCents > MAX_TIP_CENTS) {
      return NextResponse.json({ error: "Propina inválida (mín. $1 MXN)" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(bookingId);
    const { data: booking } = await supabase
      .from("service_bookings")
      .select(
        "id,buyer_id,seller_id,listing_id,status,payment_status,balance_due_mxn_cents,balance_payment_status,tip_payment_status,ticket_code",
      )
      .in("id", idVars)
      .maybeSingle();

    if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
    if (!myPool.some((id) => buyerPool.includes(id))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!(await listingSupportsSupplementPayments(supabase, String(booking.listing_id)))) {
      return NextResponse.json(
        { error: "Propina en app aplica solo a limpieza del hogar y servicios veterinarios" },
        { status: 400 },
      );
    }

    const providerSlug = await listingProviderSlug(supabase, String(booking.listing_id));

    if (!tipPayable(booking as Parameters<typeof tipPayable>[0])) {
      return NextResponse.json({ error: "La propina no está disponible para esta reserva ahora" }, { status: 400 });
    }

    const connectId = await loadSellerConnectId(supabase, String(booking.seller_id));
    if (!connectId) {
      return NextResponse.json(
        { error: "provider_connect_required", message: "El proveedor debe tener Stripe Connect activo." },
        { status: 409 },
      );
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("title_es")
      .eq("id", booking.listing_id)
      .maybeSingle();

    const serviceLabel = supplementCheckoutServiceLabel(providerSlug, "es");
    const tipDescription = supplementTipDescription(providerSlug, "es");
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items: [
        {
          price_data: {
            currency: "mxn",
            unit_amount: tipMxnCents,
            product_data: {
              name: `Propina — ${listing?.title_es ?? serviceLabel}`,
              description: tipDescription,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 0,
        transfer_data: { destination: connectId },
        metadata: {
          payment_kind: "tip",
          booking_id: bookingId,
          buyer_id: userId,
          seller_id: String(booking.seller_id),
        },
      },
      metadata: {
        payment_kind: "tip",
        booking_id: bookingId,
        buyer_id: userId,
        seller_id: String(booking.seller_id),
        tip_mxn_cents: String(tipMxnCents),
      },
      success_url: `${APP_URL}/my-bookings?session_id={CHECKOUT_SESSION_ID}&tip_paid=1&ticket=${encodeURIComponent(String(booking.ticket_code ?? bookingId))}`,
      cancel_url: `${APP_URL}/my-bookings?tip_cancelled=1`,
    });

    await supabase
      .from("service_bookings")
      .update({
        tip_mxn_cents: tipMxnCents,
        tip_payment_status: "pending",
        tip_stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", idVars);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[tip-checkout] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
