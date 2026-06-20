import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { getStripe } from "@/lib/stripe";
import { getPublicAppUrl } from "@/lib/app-url";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { balancePayable, listingProviderSlug, listingSupportsSupplementPayments } from "@/lib/housekeeping-payments";
import { connectNotReadyMessage, sellerConnectPayoutReady } from "@/lib/stripe-connect-ready";
import { supplementCheckoutServiceLabel } from "@/lib/service-quote-vertical";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST — buyer pays job balance after provider marks completed (housekeeping + veterinary). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const bookingId = params.id?.trim();
    if (!bookingId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const appUrl = getPublicAppUrl();

    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(bookingId);
    const { data: booking } = await supabase
      .from("service_bookings")
      .select(
        "id,buyer_id,seller_id,listing_id,status,payment_status,pricing_base_mxn_cents,commission_amount_cents,balance_due_mxn_cents,balance_payment_status,ticket_code",
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
        { error: "Este pago de saldo aplica solo a limpieza del hogar y servicios veterinarios" },
        { status: 400 },
      );
    }

    const providerSlug = await listingProviderSlug(supabase, String(booking.listing_id));

    if (!balancePayable(booking as Parameters<typeof balancePayable>[0])) {
      return NextResponse.json({ error: "No hay saldo pendiente para pagar en este momento" }, { status: 400 });
    }

    const connectStatus = await sellerConnectPayoutReady(supabase, String(booking.seller_id));
    if (!connectStatus.payoutReady) {
      return NextResponse.json(
        {
          error: "provider_connect_required",
          message: connectNotReadyMessage(connectStatus, "es"),
          connectStatus,
        },
        { status: 409 },
      );
    }
    const connectId = connectStatus.accountId;
    if (!connectId) {
      return NextResponse.json(
        {
          error: "provider_connect_required",
          message: "El proveedor debe activar cobros Stripe Connect antes de recibir el saldo en la app.",
        },
        { status: 409 },
      );
    }

    const amountCents = Math.round(Number(booking.balance_due_mxn_cents));
    if (amountCents < 100) {
      return NextResponse.json({ error: "Saldo inválido" }, { status: 400 });
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("title_es")
      .eq("id", booking.listing_id)
      .maybeSingle();

    const serviceLabel = supplementCheckoutServiceLabel(providerSlug, "es");
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items: [
        {
          price_data: {
            currency: "mxn",
            unit_amount: amountCents,
            product_data: {
              name: `Saldo del servicio — ${listing?.title_es ?? serviceLabel}`,
              description: `Ticket ${booking.ticket_code ?? bookingId.slice(0, 8)} — saldo después del depósito`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 0,
        transfer_data: { destination: connectId },
        metadata: {
          payment_kind: "balance",
          booking_id: bookingId,
          buyer_id: userId,
          seller_id: String(booking.seller_id),
        },
      },
      metadata: {
        payment_kind: "balance",
        booking_id: bookingId,
        buyer_id: userId,
        seller_id: String(booking.seller_id),
      },
      success_url: `${appUrl}/my-bookings?session_id={CHECKOUT_SESSION_ID}&balance_paid=1&ticket=${encodeURIComponent(String(booking.ticket_code ?? bookingId))}`,
      cancel_url: `${appUrl}/my-bookings?balance_cancelled=1`,
    });

    await supabase
      .from("service_bookings")
      .update({
        balance_stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", idVars);

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    console.error("[balance-checkout] POST", e);
    const stripeMsg = e instanceof Error ? e.message : "";
    if (stripeMsg.includes("account") || stripeMsg.includes("Connect")) {
      return NextResponse.json(
        {
          error: "provider_connect_required",
          message:
            "Stripe rechazó el pago al proveedor — el proveedor debe terminar Stripe Connect en Mi perfil (modo prueba: usa datos de prueba de Stripe).",
          detail: stripeMsg,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
