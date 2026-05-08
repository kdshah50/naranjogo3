import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookings/:id/stripe-receipt — buyer or seller; returns Stripe hosted receipt URL if available.
 * Official tax invoices (CFDI) are not generated here; Stripe’s receipt is for payment proof.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const bookingId = params.id?.trim() ?? "";
    if (!bookingId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: booking, error: fetchErr } = await supabase
      .from("service_bookings")
      .select("id,buyer_id,seller_id,payment_status,stripe_checkout_session_id,stripe_payment_intent_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (booking.payment_status !== "paid") {
      return NextResponse.json({ error: "Solo hay comprobante para pagos completados" }, { status: 400 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
    const sellerPool = await expandUserAccountIdPool(supabase, String(booking.seller_id));
    if (!poolsOverlap(myPool, buyerPool) && !poolsOverlap(myPool, sellerPool)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const stripe = getStripe();
    let receiptUrl: string | null = null;

    const chargeReceiptFromPi = async (piId: string): Promise<string | null> => {
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge"],
      });
      const lc = pi.latest_charge;
      if (typeof lc === "object" && lc && "receipt_url" in lc) {
        const url = (lc as Stripe.Charge).receipt_url;
        return url && typeof url === "string" ? url : null;
      }
      return null;
    };

    try {
      const csId = booking.stripe_checkout_session_id?.trim() ?? "";
      if (csId.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(csId, {
          expand: ["payment_intent.latest_charge"],
        });
        const pi = session.payment_intent;
        if (typeof pi === "object" && pi && "latest_charge" in pi) {
          const lc = (pi as Stripe.PaymentIntent).latest_charge;
          if (typeof lc === "object" && lc && "receipt_url" in lc) {
            const url = (lc as Stripe.Charge).receipt_url;
            receiptUrl = url && typeof url === "string" ? url : null;
          }
        }
        const piId = typeof pi === "string" ? pi : pi && typeof pi === "object" && "id" in pi ? String((pi as { id: string }).id) : null;
        if (!receiptUrl && piId) receiptUrl = await chargeReceiptFromPi(piId);
      } else if (booking.stripe_payment_intent_id?.trim()) {
        receiptUrl = await chargeReceiptFromPi(booking.stripe_payment_intent_id.trim());
      }
    } catch (e) {
      console.error("[bookings/:id/stripe-receipt] Stripe", e);
    }

    return NextResponse.json({ receiptUrl });
  } catch (e) {
    console.error("[bookings/:id/stripe-receipt] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
