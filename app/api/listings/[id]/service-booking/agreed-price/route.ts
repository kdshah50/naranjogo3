import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { userIsListingSellerAccount } from "@/lib/user-account-pool";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import { MAX_SERVICE_PRICING_BASE_MXN_CENTS } from "@/lib/service-booking-pricing";

export const dynamic = "force-dynamic";

/**
 * GET ?buyerId= — seller: current agreed subtotal for that buyer on this listing.
 * PATCH { buyerId, agreedSubtotalMxnCents?: number | null } — seller sets/clears agreed job total (centavos).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sellerUserId = await getUserIdFromRequest(req);
    if (!sellerUserId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const listingId = params.id?.trim() ?? "";
    const buyerId = req.nextUrl.searchParams.get("buyerId")?.trim() ?? "";
    if (!listingId || !buyerId) {
      return NextResponse.json({ error: "listingId y buyerId requeridos" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id")
      .eq("id", listingId)
      .maybeSingle();

    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    if (!(await userIsListingSellerAccount(supabase, sellerUserId, listing.seller_id as string))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const listVars = idMatchVariantsForIn(listing.id as string);
    const buyerVars = idMatchVariantsForIn(buyerId);
    const { data: gate } = await supabase
      .from("listing_service_contact_gate")
      .select("agreed_subtotal_mxn_cents,seller_set_agreed_price_at")
      .in("listing_id", listVars)
      .in("buyer_id", buyerVars)
      .maybeSingle();

    return NextResponse.json({
      agreedSubtotalMxnCents: gate?.agreed_subtotal_mxn_cents ?? null,
      sellerSetAgreedPriceAt: gate?.seller_set_agreed_price_at ?? null,
    });
  } catch (e) {
    console.error("[agreed-price] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sellerUserId = await getUserIdFromRequest(req);
    if (!sellerUserId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const listingId = params.id?.trim() ?? "";
    if (!listingId) {
      return NextResponse.json({ error: "listingId inválido" }, { status: 400 });
    }

    const json = await req.json().catch(() => ({}));
    const buyerId = String((json as { buyerId?: string }).buyerId ?? "").trim();
    const centsRaw = (json as { agreedSubtotalMxnCents?: unknown }).agreedSubtotalMxnCents;

    if (!buyerId) {
      return NextResponse.json({ error: "buyerId requerido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id,status,title_es")
      .eq("id", listingId)
      .maybeSingle();

    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    if (!(await userIsListingSellerAccount(supabase, sellerUserId, listing.seller_id as string))) {
      return NextResponse.json({ error: "Solo el dueño del anuncio puede fijar el precio acordado" }, { status: 403 });
    }

    const slug = inferProviderSlugFromListingTitle(String(listing.title_es ?? ""));
    if (providerServiceRequiresQuoteAccept(slug)) {
      return NextResponse.json(
        {
          error:
            "Usa «Enviar cotización al cliente» en el chat para cotizaciones oficiales (Aceptar/Rechazar + WhatsApp).",
          code: "use_official_quote_send",
        },
        { status: 400 },
      );
    }

    const listingRowId = listing.id as string;
    const listVars = idMatchVariantsForIn(listingRowId);
    const buyerVars = idMatchVariantsForIn(buyerId);
    if (listVars.length === 0 || buyerVars.length === 0) {
      return NextResponse.json({ error: "Identificadores inválidos" }, { status: 400 });
    }

    const { data: conv, error: cErr } = await supabase
      .from("listing_conversations")
      .select("id,buyer_id")
      .in("listing_id", listVars)
      .in("buyer_id", buyerVars)
      .limit(1)
      .maybeSingle();

    if (cErr || !conv?.id) {
      return NextResponse.json(
        { error: "No hay conversación en la app con este comprador en este anuncio" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    if (centsRaw === null) {
      const { error: upErr } = await supabase
        .from("listing_service_contact_gate")
        .update({
          agreed_subtotal_mxn_cents: null,
          seller_set_agreed_price_at: null,
          quote_status: "none",
          quote_line_items: null,
          quote_metadata: null,
          quote_sent_at: null,
          quote_responded_at: null,
          updated_at: now,
        })
        .in("listing_id", listVars)
        .in("buyer_id", buyerVars);

      if (upErr) {
        console.error("[agreed-price] clear", upErr);
        return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, agreedSubtotalMxnCents: null });
    }

    const n = Math.round(Number(centsRaw));
    if (!Number.isFinite(n) || n < 100 || n > MAX_SERVICE_PRICING_BASE_MXN_CENTS) {
      return NextResponse.json(
        {
          error: `Monto inválido (usa centavos enteros entre 100 y ${MAX_SERVICE_PRICING_BASE_MXN_CENTS})`,
        },
        { status: 400 },
      );
    }

    const gateBuyerId = String(conv.buyer_id ?? buyerId);

    const { error: upsertErr } = await supabase.from("listing_service_contact_gate").upsert(
      {
        listing_id: listingRowId,
        buyer_id: gateBuyerId,
        contacted_in_app: true,
        agreed_subtotal_mxn_cents: n,
        seller_set_agreed_price_at: now,
        updated_at: now,
      },
      { onConflict: "listing_id,buyer_id" },
    );

    if (upsertErr) {
      console.error("[agreed-price] upsert", upsertErr);
      return NextResponse.json({ error: "No se pudo guardar el precio acordado" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, agreedSubtotalMxnCents: n, sellerSetAt: now });
  } catch (e) {
    console.error("[agreed-price] PATCH", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
