import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { getStripe, computeCommissionCents, DEFAULT_COMMISSION_PCT, MIN_COMMISSION_CENTS_MXN } from "@/lib/stripe";
import { getNextBookingDiscount, redeemDiscount } from "@/lib/loyalty";
import { isServicesListing } from "@/lib/listing-category";
import { listingHasActivePackage } from "@/lib/package-pricing";
import { buyerHasSentInAppMessage, ensureContactGateFromMessages, unlockContactGateIfRepeatBuyerWithSeller } from "@/lib/contact-gate";
import { getPublicAppUrl } from "@/lib/app-url";
import { checkoutBlockedByExistingPaidRows } from "@/lib/booking-checkout-guard";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";
import {
  computeCartPricing,
  applyLoyaltyDiscountToCartPricing,
  marketplaceApplicationFeeCents,
  getMarketplaceVatPercent,
} from "@/lib/marketplace-cart-pricing";
import { resolveServicePricingBaseMxnCents } from "@/lib/service-booking-pricing";

export const dynamic = "force-dynamic";
/** Allow Stripe + retries to finish on Vercel (requires Hobby 10s default or Pro for 60s). */
export const maxDuration = 60;

const APP_URL = getPublicAppUrl();

type CheckoutMode = "commission_only" | "full_connect";

/**
 * POST { listingId, note?, checkoutMode?: 'commission_only' | 'full_connect' }
 * commission_only: Stripe session charges platform fee only (default).
 * full_connect: subtotal + comisión + IVA; requires seller Stripe Connect (same split as cart).
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
    const checkoutModeRaw = String((json as { checkoutMode?: string }).checkoutMode ?? "commission_only").trim();
    const checkoutMode: CheckoutMode =
      checkoutModeRaw === "full_connect" ? "full_connect" : "commission_only";

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

    const { data: gatePricing } = await supabase
      .from("listing_service_contact_gate")
      .select("agreed_subtotal_mxn_cents,seller_set_agreed_price_at")
      .eq("listing_id", listingId)
      .in("buyer_id", myPool)
      .maybeSingle();

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

    if (checkoutBlockedByExistingPaidRows(existingPaidRows ?? [])) {
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
    const listingPricingRow = {
      price_mxn: Number(listing.price_mxn) || 0,
      package_session_count: listing.package_session_count as number | null,
      package_total_price_mxn: listing.package_total_price_mxn as number | null,
    };
    const gateForPricing = gatePricing
      ? {
          agreed_subtotal_mxn_cents: gatePricing.agreed_subtotal_mxn_cents as number | null,
          seller_set_agreed_price_at: gatePricing.seller_set_agreed_price_at as string | null,
        }
      : null;

    const pricingBase = resolveServicePricingBaseMxnCents({
      listing: listingPricingRow,
      gate: gateForPricing,
    });

    if (checkoutMode === "full_connect" && pricingBase <= 0) {
      return NextResponse.json(
        { error: "Precio del servicio no disponible para pago completo (falta precio en el anuncio o precio acordado)." },
        { status: 400 }
      );
    }

    const connectId =
      checkoutMode === "full_connect" ? await loadSellerConnectId(supabase, listing.seller_id as string) : null;
    if (checkoutMode === "full_connect" && !connectId) {
      return NextResponse.json(
        {
          error: "seller_payouts_pending",
          message:
            "Este proveedor aún no activa cobros con Stripe en Naranjogo. Puedes pagar solo la tarifa de la plataforma o coordinar el servicio por WhatsApp.",
        },
        { status: 409 }
      );
    }

    let loyaltyDiscount = 0;
    let loyaltyDiscountPct = 0;
    try {
      const reward = await getNextBookingDiscount(supabase, userId);
      if (reward.discountPct > 0) {
        loyaltyDiscountPct = reward.discountPct;
      }
    } catch (loyaltyErr) {
      console.error("[checkout] loyalty check failed (non-fatal)", loyaltyErr);
    }

    const pkgCount = listingHasActivePackage(
      listing as { package_session_count?: number | null; package_total_price_mxn?: number | null }
    )
      ? (listing as { package_session_count: number }).package_session_count
      : null;

    const svc = isServicesListing(listing);
    const stripe = getStripe();

    let insertPayload: Record<string, unknown>;
    let sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0];
    const discountLabel = loyaltyDiscountPct > 0 ? ` (descuento lealtad ${loyaltyDiscountPct}% aplicado)` : "";

    if (checkoutMode === "full_connect") {
      let cartP = computeCartPricing([
        {
          listingId,
          qty: 1,
          unitPriceMxnCents: pricingBase,
          commissionPct,
          titleEs: String(listing.title_es ?? ""),
        },
      ]);
      const commBeforeLoyalty = cartP.commissionCents;
      if (loyaltyDiscountPct > 0) {
        cartP = applyLoyaltyDiscountToCartPricing(cartP, loyaltyDiscountPct);
      }
      loyaltyDiscount = Math.max(0, commBeforeLoyalty - cartP.commissionCents);

      const applicationFeeCents = marketplaceApplicationFeeCents(cartP);
      const vatPct = getMarketplaceVatPercent();

      insertPayload = {
        listing_id: listingId,
        buyer_id: userId,
        seller_id: listing.seller_id,
        commission_amount_cents: cartP.commissionCents,
        commission_pct: commissionPct,
        pricing_base_mxn_cents: pricingBase,
        checkout_mode: "full_connect",
        subtotal_mxn_cents: cartP.subtotalCents,
        vat_mxn_cents: cartP.vatCents,
        total_charged_mxn_cents: cartP.totalCents,
        stripe_application_fee_mxn_cents: applicationFeeCents,
        note,
        payment_status: "pending",
        package_session_count: pkgCount,
      };

      const itemDesc = `Servicio — pago al proveedor vía Stripe Connect (${String(listing.title_es ?? "")})`;

      sessionParams = {
        mode: "payment",
        currency: "mxn",
        line_items: [
          {
            price_data: {
              currency: "mxn",
              unit_amount: cartP.subtotalCents,
              product_data: {
                name: `Servicio (proveedor) — ${listing.title_es}`,
                description: itemDesc,
              },
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "mxn",
              unit_amount: cartP.commissionCents,
              product_data: {
                name: "Tarifa Naranjogo (comisión)",
                description: `Comisión de plataforma ${commissionPct}%${discountLabel}`,
              },
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "mxn",
              unit_amount: cartP.vatCents,
              product_data: {
                name: `IVA (${vatPct}%)`,
                description: "Impuesto sobre subtotal + comisión",
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeCents,
          transfer_data: { destination: connectId! },
          metadata: {
            booking_checkout: "service_full_connect",
            booking_id: "",
            buyer_id: userId,
            seller_id: String(listing.seller_id),
          },
        },
        metadata: {
          booking_id: "",
          listing_id: listingId,
          buyer_id: userId,
          seller_id: listing.seller_id,
          checkout_mode: "full_connect",
        },
        success_url: `${APP_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/listing/${listingId}?booking_cancelled=1`,
      };
    } else {
      let commissionCents = computeCommissionCents(pricingBase, commissionPct);
      if (!Number.isFinite(commissionCents) || commissionCents < MIN_COMMISSION_CENTS_MXN) {
        commissionCents = MIN_COMMISSION_CENTS_MXN;
      }
      if (loyaltyDiscountPct > 0) {
        loyaltyDiscount = Math.round(commissionCents * loyaltyDiscountPct / 100);
        commissionCents = Math.max(commissionCents - loyaltyDiscount, MIN_COMMISSION_CENTS_MXN);
      }

      insertPayload = {
        listing_id: listingId,
        buyer_id: userId,
        seller_id: listing.seller_id,
        commission_amount_cents: commissionCents,
        commission_pct: commissionPct,
        pricing_base_mxn_cents: pricingBase,
        checkout_mode: "commission_only",
        note,
        payment_status: "pending",
        package_session_count: pkgCount,
      };

      const isPkg = listingHasActivePackage(
        listing as { package_session_count?: number | null; package_total_price_mxn?: number | null }
      );
      const lineDesc = isPkg
        ? `Plan aprobado: ${(listing as { package_session_count: number }).package_session_count} sesiones (base ${commissionPct}%)${discountLabel}`
        : svc
          ? `Tarifa de servicio (${commissionPct}%) para conectarte con el proveedor${discountLabel}`
          : `Tarifa de conexión (${commissionPct}%) — desbloquea WhatsApp del vendedor${discountLabel}`;

      sessionParams = {
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
          booking_id: "",
          listing_id: listingId,
          buyer_id: userId,
          seller_id: listing.seller_id,
          checkout_mode: "commission_only",
        },
        success_url: `${APP_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/listing/${listingId}?booking_cancelled=1`,
      };
    }

    const { data: booking, error: bookErr } = await supabase
      .from("service_bookings")
      .insert(insertPayload)
      .select("id")
      .single();

    if (bookErr || !booking) {
      console.error("[checkout] booking insert", bookErr);
      return NextResponse.json({ error: "No se pudo crear la reserva" }, { status: 500 });
    }

    const bookingId = String(booking.id);
    sessionParams.metadata = { ...sessionParams.metadata, booking_id: bookingId };
    if (checkoutMode === "full_connect" && sessionParams.payment_intent_data?.metadata) {
      sessionParams.payment_intent_data = {
        ...sessionParams.payment_intent_data,
        metadata: { ...sessionParams.payment_intent_data.metadata, booking_id: bookingId },
      };
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
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

    if (loyaltyDiscount > 0 && loyaltyDiscountPct > 0) {
      try {
        await redeemDiscount(supabase, userId, booking.id, loyaltyDiscount, loyaltyDiscountPct);
      } catch (loyaltyErr) {
        console.error("[checkout] loyalty redeem failed (non-fatal)", loyaltyErr);
      }
    }

    return NextResponse.json({
      url: session.url,
      bookingId: booking.id,
      checkoutMode,
      loyaltyDiscount:
        loyaltyDiscount > 0 ? { pct: loyaltyDiscountPct, amountCents: loyaltyDiscount } : null,
    });
  } catch (e) {
    console.error("[checkout] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
