import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { getStripe, computeCommissionCents, DEFAULT_COMMISSION_PCT, MIN_COMMISSION_CENTS_MXN } from "@/lib/stripe";
import { getNextBookingDiscount, redeemDiscount } from "@/lib/loyalty";
import { isServicesListing } from "@/lib/listing-category";
import { effectiveListingPriceMxnCents, listingHasActivePackage } from "@/lib/package-pricing";
import { buyerHasSentInAppMessage, ensureContactGateFromMessages, unlockContactGateIfRepeatBuyerWithSeller } from "@/lib/contact-gate";
import { getPublicAppUrl } from "@/lib/app-url";
import { checkoutBlockedByExistingPaidRows } from "@/lib/booking-checkout-guard";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";
/** Allow Stripe + retries to finish on Vercel (requires Hobby 10s default or Pro for 60s). */
export const maxDuration = 60;

const APP_URL = getPublicAppUrl();

/**
 * POST { listingId, note? }
 * Creates a Stripe Checkout Session for the commission fee.
 * Buyer must have contacted the seller in-app first.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const json = await req.json().catch(() => ({}));
    const listingId = String((json as { listingId?: string }).listingId ?? "").trim();
    const note = String((json as { note?: string }).note ?? "").trim() || null;

    if (!listingId) {
      return NextResponse.json({ error: "listingId requerido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();

    const { data: listing } = await supabase
      .from("listings")
      .select("id,seller_id,category_id,status,title_es,price_mxn,commission_pct,package_session_count,package_total_price_mxn")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }
    if (listing.status !== "active") {
      return NextResponse.json({ error: "Este anuncio no está activo" }, { status: 400 });
    }
    if (!listing.seller_id) {
      return NextResponse.json({ error: "Este anuncio no tiene proveedor asignado" }, { status: 400 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);

    if (await userIsListingSellerAccount(supabase, userId, listing.seller_id as string)) {
      return NextResponse.json({ error: "No puedes reservar tu propio anuncio" }, { status: 400 });
    }

    const { data: gate } = await supabase
      .from("listing_service_contact_gate")
      .select("contacted_in_app")
      .eq("listing_id", listingId)
      .in("buyer_id", myPool)
      .maybeSingle();

    let contactOk = Boolean(gate?.contacted_in_app);
    if (!contactOk) {
      const sent = await buyerHasSentInAppMessage(supabase, listingId, userId);
      if (sent) {
        await ensureContactGateFromMessages(supabase, listingId, userId);
        contactOk = true;
      }
    }
    if (!contactOk) {
      contactOk = await unlockContactGateIfRepeatBuyerWithSeller(
        supabase,
        listingId,
        userId,
        listing.seller_id as string,
        myPool
      );
    }
    if (!contactOk) {
      return NextResponse.json(
        { error: "Primero contacta al proveedor por mensajes en la app." },
        { status: 400 }
      );
    }

    const hasPackageListing = listingHasActivePackage(
      listing as { package_session_count?: number | null; package_total_price_mxn?: number | null }
    );

    const { data: existingPaidRows } = await supabase
      .from("service_bookings")
      .select("status")
      .eq("listing_id", listingId)
      .in("buyer_id", myPool)
      .eq("payment_status", "paid")
      .limit(50);

    if (checkoutBlockedByExistingPaidRows(existingPaidRows ?? [], hasPackageListing)) {
      return NextResponse.json(
        {
          error: hasPackageListing
            ? "Ya tienes una reserva pagada para este plan en este anuncio."
            : "Ya tienes una reserva activa para este anuncio. Cuando termine o se cancele, podrás pagar de nuevo.",
        },
        { status: 400 }
      );
    }

    const commissionPct = Number(listing.commission_pct ?? DEFAULT_COMMISSION_PCT);
    const priceBase = effectiveListingPriceMxnCents(
      listing as { price_mxn: number; package_session_count?: number | null; package_total_price_mxn?: number | null }
    );
    let commissionCents = computeCommissionCents(priceBase, commissionPct);
    if (!Number.isFinite(commissionCents) || commissionCents < MIN_COMMISSION_CENTS_MXN) {
      commissionCents = MIN_COMMISSION_CENTS_MXN;
    }

    // Check for loyalty milestone discount
    let loyaltyDiscount = 0;
    let loyaltyDiscountPct = 0;
    try {
      const reward = await getNextBookingDiscount(supabase, userId);
      if (reward.discountPct > 0) {
        loyaltyDiscountPct = reward.discountPct;
        loyaltyDiscount = Math.round(commissionCents * loyaltyDiscountPct / 100);
        commissionCents = Math.max(commissionCents - loyaltyDiscount, MIN_COMMISSION_CENTS_MXN);
      }
    } catch (loyaltyErr) {
      console.error("[checkout] loyalty check failed (non-fatal)", loyaltyErr);
    }

    const pkgCount = listingHasActivePackage(
      listing as { package_session_count?: number | null; package_total_price_mxn?: number | null }
    )
      ? (listing as { package_session_count: number }).package_session_count
      : null;

    const { data: booking, error: bookErr } = await supabase
      .from("service_bookings")
      .insert({
        listing_id: listingId,
        buyer_id: userId,
        seller_id: listing.seller_id,
        commission_amount_cents: commissionCents,
        commission_pct: commissionPct,
        note,
        payment_status: "pending",
        package_session_count: pkgCount,
      })
      .select("id")
      .single();

    if (bookErr || !booking) {
      console.error("[checkout] booking insert", bookErr);
      return NextResponse.json({ error: "No se pudo crear la reserva" }, { status: 500 });
    }

    const stripe = getStripe();

    const discountLabel = loyaltyDiscount > 0
      ? ` (descuento lealtad ${loyaltyDiscountPct}% aplicado)`
      : "";

    const isPkg = listingHasActivePackage(
      listing as { package_session_count?: number | null; package_total_price_mxn?: number | null }
    );
    const svc = isServicesListing(listing);
    const lineDesc = isPkg
      ? `Plan aprobado: ${(listing as { package_session_count: number }).package_session_count} sesiones (precio acordado; tarifa de plataforma ${commissionPct}%)${discountLabel}`
      : svc
        ? `Tarifa de servicio (${commissionPct}%) para conectarte con el proveedor${discountLabel}`
        : `Tarifa de conexión (${commissionPct}%) — desbloquea WhatsApp del vendedor${discountLabel}`;

    let session;
    try {
      session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items: [
        {
          price_data: {
            currency: "mxn",
            unit_amount: commissionCents,
            product_data: {
              name: isPkg
                ? `Comisión de reserva (paquete) — ${listing.title_es}`
                : svc
                  ? `Comisión de reserva — ${listing.title_es}`
                  : `Tarifa de contacto — ${listing.title_es}`,
              description: lineDesc,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: booking.id,
        listing_id: listingId,
        buyer_id: userId,
        seller_id: listing.seller_id,
      },
      success_url: `${APP_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/listing/${listingId}?booking_cancelled=1`,
    });
    } catch (stripeErr: unknown) {
      console.error("[checkout] Stripe checkout.sessions.create", stripeErr);
      await supabase.from("service_bookings").delete().eq("id", booking.id);
      const msg =
        stripeErr && typeof stripeErr === "object" && "message" in stripeErr
          ? String((stripeErr as { message?: string }).message)
          : "Stripe error";
      return NextResponse.json(
        { error: "No se pudo iniciar el pago. Intenta de nuevo o contacta soporte.", detail: msg },
        { status: 502 }
      );
    }

    await supabase
      .from("service_bookings")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", booking.id);

    // Log loyalty discount redemption if applicable
    if (loyaltyDiscount > 0) {
      try {
        await redeemDiscount(supabase, userId, booking.id, loyaltyDiscount, loyaltyDiscountPct);
      } catch (loyaltyErr) {
        console.error("[checkout] loyalty redeem failed (non-fatal)", loyaltyErr);
      }
    }

    return NextResponse.json({
      url: session.url,
      bookingId: booking.id,
      loyaltyDiscount: loyaltyDiscount > 0 ? { pct: loyaltyDiscountPct, amountCents: loyaltyDiscount } : null,
    });
  } catch (e) {
    console.error("[checkout] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
