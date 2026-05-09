import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { isServicesListing } from "@/lib/listing-category";
import { buyerHasSentInAppMessage, ensureContactGateFromMessages, unlockContactGateIfRepeatBuyerWithSeller } from "@/lib/contact-gate";
import { computeCommissionCents, MIN_COMMISSION_CENTS_MXN } from "@/lib/stripe";
import { getNextBookingDiscount } from "@/lib/loyalty";
import {
  effectiveListingPriceMxnCents,
  listingHasActivePackage,
  packageVsListSavings,
} from "@/lib/package-pricing";
import { checkoutBlockedByExistingPaidRows } from "@/lib/booking-checkout-guard";
import { canonicalBookingRowIdKey, mergeBookingListRowsPreferTruth } from "@/lib/booking-list-merge";
import { poolsOverlap, expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

const PAID_LISTING_MERGE_LIMIT = 60;

type PaidRow = Record<string, unknown> & {
  id: string;
  buyer_id: string;
  status?: string | null;
  seller_phone_snapshot?: string | null;
  paid_at?: string | null;
  created_at?: string;
  ticket_code?: string | null;
};

function cmpPaidRecent(a: PaidRow, b: PaidRow): number {
  const pa = a.paid_at ? new Date(String(a.paid_at)).getTime() : 0;
  const pb = b.paid_at ? new Date(String(b.paid_at)).getTime() : 0;
  if (pb !== pa) return pb - pa;
  return new Date(String(b.created_at ?? 0)).getTime() - new Date(String(a.created_at ?? 0)).getTime();
}

/**
 * Same visibility as buyer GET /api/bookings: paid rows on this listing where merged buyer pools
 * overlap (covers stale `buyer_id` after account linking).
 */
async function mergePaidBookingsForListingBuyer(
  supabase: ReturnType<typeof createAdminSupabase>,
  listingId: string,
  myPool: string[],
): Promise<PaidRow[]> {
  const listVars = idMatchVariantsForIn(listingId);
  if (listVars.length === 0 || myPool.length === 0) return [];

  const cols =
    "id,buyer_id,payment_status,seller_phone_snapshot,paid_at,status,package_session_count,ticket_code,created_at,updated_at";

  const { data: byBuyer } = await supabase
    .from("service_bookings")
    .select(cols)
    .in("listing_id", listVars)
    .in("buyer_id", myPool)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PAID_LISTING_MERGE_LIMIT);

  const { data: byListing } = await supabase
    .from("service_bookings")
    .select(cols)
    .in("listing_id", listVars)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PAID_LISTING_MERGE_LIMIT);

  const merged = new Map<string, PaidRow>();
  for (const row of byBuyer ?? []) {
    merged.set(canonicalBookingRowIdKey(row.id), row as PaidRow);
  }

  const poolCache = new Map<string, string[]>();
  const rowBuyerPool = async (buyerId: string) => {
    if (!poolCache.has(buyerId)) {
      poolCache.set(buyerId, await expandUserAccountIdPool(supabase, String(buyerId)));
    }
    return poolCache.get(buyerId)!;
  };

  for (const row of byListing ?? []) {
    const key = canonicalBookingRowIdKey(row.id);
    const rowPool = await rowBuyerPool(String(row.buyer_id));
    if (!poolsOverlap(rowPool, myPool)) continue;
    const prev = merged.get(key);
    if (!prev) merged.set(key, row as PaidRow);
    else merged.set(key, mergeBookingListRowsPreferTruth(prev, row as PaidRow) as PaidRow);
  }

  return [...merged.values()].sort(cmpPaidRecent);
}

const jsonNoStore = { "Cache-Control": "private, no-store, max-age=0" as const };

async function loadListing(supabase: ReturnType<typeof createAdminSupabase>, listingId: string) {
  const { data, error } = await supabase
    .from("listings")
    .select("id,seller_id,category_id,status,title_es")
    .eq("id", listingId)
    .maybeSingle();
  if (error || !data) return { listing: null as null | Record<string, unknown>, error };
  return { listing: data, error: null };
}

/** GET — contact gate + commission booking state (all categories; `isService` = services copy tier only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const listingId = params.id;
    const supabase = createAdminSupabase();
    const { listing, error: le } = await loadListing(supabase, listingId);
    if (le || !listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    const isServicesCategory = isServicesListing(listing);
    const sellerId = listing.seller_id as string | null;

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({
        isService: isServicesCategory,
        needLogin: true,
        canBook: false,
        contactedInApp: false,
        flowActive: false,
      });
    }

    if (sellerId && (await userIsListingSellerAccount(supabase, userId, sellerId))) {
      return NextResponse.json({
        isService: isServicesCategory,
        isSeller: true,
        canBook: false,
        contactedInApp: false,
        flowActive: false,
      });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);

    const { data: gate } = await supabase
      .from("listing_service_contact_gate")
      .select("contacted_in_app")
      .eq("listing_id", listingId)
      .in("buyer_id", myPool)
      .maybeSingle();

    let contactedInApp = Boolean(gate?.contacted_in_app);
    if (!contactedInApp) {
      const sent = await buyerHasSentInAppMessage(supabase, listingId, userId);
      if (sent) {
        contactedInApp = true;
        await ensureContactGateFromMessages(supabase, listingId, userId);
      }
    }
    if (!contactedInApp && sellerId) {
      const unlocked = await unlockContactGateIfRepeatBuyerWithSeller(
        supabase,
        listingId,
        userId,
        String(sellerId),
        myPool
      );
      if (unlocked) contactedInApp = true;
    }

    const hasContacted = contactedInApp;

    const { data: listingPricing } = await supabase
      .from("listings")
      .select("price_mxn,commission_pct,package_session_count,package_total_price_mxn")
      .eq("id", listingId)
      .maybeSingle();

    const hasPackage = listingHasActivePackage({
      package_session_count: listingPricing?.package_session_count,
      package_total_price_mxn: listingPricing?.package_total_price_mxn,
    });

    const paidRows = await mergePaidBookingsForListingBuyer(supabase, listingId, myPool);
    const latestPaid = paidRows[0] ?? null;
    const checkoutBlocked = checkoutBlockedByExistingPaidRows(
      paidRows.map((r) => ({ status: r.status ?? null })),
    );

    let revealedPhone: string | null = null;
    let revealedWhatsappUrl: string | null = null;
    if (latestPaid) {
      const snap = latestPaid.seller_phone_snapshot;
      revealedPhone = typeof snap === "string" ? snap : null;
      if (!revealedPhone && listing.seller_id) {
        const sellerIdVars = idMatchVariantsForIn(String(listing.seller_id));
        const { data: sellerUser } = await supabase
          .from("users")
          .select("phone")
          .in("id", sellerIdVars)
          .limit(1)
          .maybeSingle();
        revealedPhone = sellerUser?.phone ?? null;
      }
      if (revealedPhone) {
        const digits = revealedPhone.replace(/\D/g, "");
        const waIntro = isServicesCategory
          ? `Hola! Ya reservé tu servicio "${listing.title_es}" en Naranjogo.`
          : `Hola! Vi tu anuncio "${listing.title_es}" en Naranjogo y ya completé el contacto por la app.`;
        revealedWhatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(waIntro)}`;
      }
    }

    const { data: pendingBookings } = await supabase
      .from("service_bookings")
      .select("id,stripe_checkout_session_id")
      .eq("listing_id", listingId)
      .in("buyer_id", myPool)
      .eq("payment_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    const pendingBooking = pendingBookings?.[0] ?? null;

    const commPct = Number(listingPricing?.commission_pct ?? 10);
    const base = effectiveListingPriceMxnCents({
      price_mxn: Number(listingPricing?.price_mxn) || 0,
      package_session_count: listingPricing?.package_session_count,
      package_total_price_mxn: listingPricing?.package_total_price_mxn,
    });
    let commCents = computeCommissionCents(base, commPct);
    if (!Number.isFinite(commCents) || commCents < MIN_COMMISSION_CENTS_MXN) {
      commCents = MIN_COMMISSION_CENTS_MXN;
    }

    let commissionBeforeLoyaltyCents: number | null = null;
    let loyaltyDiscountPctApplied: number | null = null;
    let loyaltyDiscountCents: number | null = null;
    try {
      const reward = await getNextBookingDiscount(supabase, userId);
      if (reward.discountPct > 0) {
        commissionBeforeLoyaltyCents = commCents;
        loyaltyDiscountPctApplied = reward.discountPct;
        loyaltyDiscountCents = Math.round(commCents * reward.discountPct / 100);
        commCents = Math.max(commCents - loyaltyDiscountCents, MIN_COMMISSION_CENTS_MXN);
      }
    } catch (loyaltyErr) {
      console.error("[service-booking] loyalty preview failed (non-fatal)", loyaltyErr);
    }

    const pkgSavings =
      hasPackage && listingPricing
        ? packageVsListSavings({
            price_mxn: Number(listingPricing.price_mxn) || 0,
            package_session_count: listingPricing.package_session_count,
            package_total_price_mxn: listingPricing.package_total_price_mxn,
          })
        : null;

    return NextResponse.json(
      {
        isService: isServicesCategory,
        flowActive: true,
        canBook: hasContacted,
        contactedInApp,
        checkoutBlocked,
        paidBookingId: latestPaid?.id ?? null,
        paidBookingStatus: latestPaid ? (String(latestPaid.status ?? "confirmed")) : null,
        ticketCode: latestPaid?.ticket_code != null ? String(latestPaid.ticket_code) : null,
        revealedWhatsappUrl,
        hasPendingBooking: !!pendingBooking,
        pendingBookingId: pendingBooking?.id ?? null,
        commissionAmountCents: commCents,
        commissionBeforeLoyaltyCents,
        loyaltyDiscountPctApplied,
        loyaltyDiscountCents,
        commissionPct: commPct,
        hasPackage,
        packageSessionCount: hasPackage ? listingPricing?.package_session_count : null,
        packageTotalMxnCents: hasPackage ? listingPricing?.package_total_price_mxn : null,
        packageSavingsPctApprox: pkgSavings?.savingsPctApprox ?? null,
        packageSavingsMxnCents: pkgSavings?.savingsCents ?? null,
      },
      { headers: jsonNoStore },
    );
  } catch (e) {
    console.error("[service-booking] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/** POST { action: "request", note, buyer_preference_text? } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const listingId = params.id;
    const json = await req.json().catch(() => ({}));
    const action = String((json as { action?: string }).action ?? "");

    const supabase = createAdminSupabase();
    const { listing, error: le } = await loadListing(supabase, listingId);
    if (le || !listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    const sellerId = listing.seller_id as string | null;
    if (!sellerId) {
      return NextResponse.json({ error: "Anuncio sin proveedor" }, { status: 400 });
    }
    if (await userIsListingSellerAccount(supabase, userId, sellerId)) {
      return NextResponse.json({ error: "No puedes reservar tu propio anuncio" }, { status: 400 });
    }

    if (listing.status !== "active") {
      return NextResponse.json({ error: "Este anuncio no está activo" }, { status: 400 });
    }

    if (action === "request") {
      const myPool = await expandUserAccountIdPool(supabase, userId);
      const note = String((json as { note?: string }).note ?? "").trim();
      if (!note || note.length > 2000) {
        return NextResponse.json({ error: "Describe tu solicitud (1–2000 caracteres)" }, { status: 400 });
      }

      const prefRaw = (json as { buyer_preference_text?: string }).buyer_preference_text;
      const buyer_preference_text =
        typeof prefRaw === "string" && prefRaw.trim().length > 0
          ? prefRaw.trim().slice(0, 500)
          : null;

      const { data: gate } = await supabase
        .from("listing_service_contact_gate")
        .select("contacted_in_app")
        .eq("listing_id", listingId)
        .in("buyer_id", myPool)
        .maybeSingle();

      let contactedInApp = Boolean(gate?.contacted_in_app);
      if (!contactedInApp) {
        const sent = await buyerHasSentInAppMessage(supabase, listingId, userId);
        if (sent) {
          await ensureContactGateFromMessages(supabase, listingId, userId);
          contactedInApp = true;
        }
      }
      if (!contactedInApp) {
        return NextResponse.json(
          { error: "Primero contacta al proveedor por mensajes en la app." },
          { status: 400 }
        );
      }

      const { data: created, error: insErr } = await supabase
        .from("service_booking_requests")
        .insert({
          listing_id: listingId,
          buyer_id: userId,
          note,
          buyer_preference_text,
        })
        .select("id,created_at")
        .single();

      if (insErr) {
        console.error("[service-booking] request insert", insErr);
        return NextResponse.json({ error: "No se pudo enviar la solicitud" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, request: created });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    console.error("[service-booking] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
