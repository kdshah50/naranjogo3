import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import { MAX_SERVICE_PRICING_BASE_MXN_CENTS } from "@/lib/service-booking-pricing";
import {
  buildMenuQuoteMessage,
  parseQuoteLineItems,
  parseQuoteMetadata,
  type ServiceQuoteLineItem,
} from "@/lib/service-quote";
import {
  insertListingChatMessage,
  loadServiceQuoteGate,
  replicateServiceQuoteGateToBuyerPool,
  resolveConversationForBuyer,
} from "@/lib/service-quote-server";
import { notifyBuyerServiceQuoteSent, notifySellerQuoteSent } from "@/lib/service-quote-notify";
import { sellerHasConnectForHousekeeping } from "@/lib/housekeeping-payments";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/** POST — seller sends official quote to buyer (sets pending + agreed total). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sellerUserId = await getUserIdFromRequest(req);
    if (!sellerUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const listingId = params.id?.trim() ?? "";
    if (!listingId) return NextResponse.json({ error: "listingId inválido" }, { status: 400 });

    const json = await req.json().catch(() => ({}));
    const buyerId = String((json as { buyerId?: string }).buyerId ?? "").trim();
    const agreedSubtotalMxnCents = Math.round(Number((json as { agreedSubtotalMxnCents?: unknown }).agreedSubtotalMxnCents));
    const messageBodyRaw = (json as { messageBody?: string }).messageBody;
    const lineItemsRaw = (json as { quoteLineItems?: unknown }).quoteLineItems;
    const metadataRaw = (json as { quoteMetadata?: unknown }).quoteMetadata;
    const lang = (json as { lang?: string }).lang === "en" ? "en" : "es";

    if (!buyerId) return NextResponse.json({ error: "buyerId requerido" }, { status: 400 });
    if (!Number.isFinite(agreedSubtotalMxnCents) || agreedSubtotalMxnCents < 100 || agreedSubtotalMxnCents > MAX_SERVICE_PRICING_BASE_MXN_CENTS) {
      return NextResponse.json({ error: "Monto de cotización inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const listingIdVars = idMatchVariantsForIn(listingId);
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id,title_es,service_menu")
      .in("id", listingIdVars)
      .maybeSingle();
    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    if (!(await userIsListingSellerAccount(supabase, sellerUserId, listing.seller_id as string))) {
      return NextResponse.json({ error: "Solo el proveedor puede enviar cotizaciones" }, { status: 403 });
    }

    const slug = inferProviderSlugFromListingTitle(listing.title_es as string);
    if (!providerServiceRequiresQuoteAccept(slug)) {
      return NextResponse.json({ error: "Este anuncio no usa flujo de cotización" }, { status: 400 });
    }

    const sellerConnectReady = await sellerHasConnectForHousekeeping(supabase, String(listing.seller_id));

    const conv = await resolveConversationForBuyer(supabase, listingId, buyerId);
    if (!conv) {
      return NextResponse.json({ error: "No hay conversación con este cliente" }, { status: 400 });
    }

    const quoteLineItems = parseQuoteLineItems(lineItemsRaw) ?? [];
    const quoteMetadata = parseQuoteMetadata(metadataRaw) ?? { kind: "provider_quote" as const, lang };
    quoteMetadata.kind = "provider_quote";
    quoteMetadata.lang = lang;

    const menu = listing.service_menu as { items?: ServiceQuoteLineItem[]; disclaimer_es?: string; disclaimer_en?: string } | null;
    let messageBody = typeof messageBodyRaw === "string" ? messageBodyRaw.trim() : "";
    if (!messageBody && menu?.items?.length && quoteLineItems.length > 0) {
      messageBody = buildMenuQuoteMessage({
        menu: listing.service_menu as Parameters<typeof buildMenuQuoteMessage>[0]["menu"],
        lineItems: quoteLineItems,
        totalCents: agreedSubtotalMxnCents,
        lang,
        visitFrequency: quoteMetadata.visitFrequency,
        quoteBasis: quoteMetadata.quoteBasis,
        headerKind: "provider_quote",
      });
    }
    if (!messageBody) {
      messageBody =
        lang === "en"
          ? `📋 Official quote: ${(agreedSubtotalMxnCents / 100).toLocaleString("en-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}. Open the app to Accept or Decline.`
          : `📋 Cotización oficial: ${(agreedSubtotalMxnCents / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}. Abre la app para Aceptar o Rechazar.`;
    }

    const now = new Date().toISOString();
    const gateBuyerId = conv.buyer_id;
    const listVars = idMatchVariantsForIn(listingId);
    const buyerVars = idMatchVariantsForIn(gateBuyerId);

    const { error: upsertErr } = await supabase.from("listing_service_contact_gate").upsert(
      {
        listing_id: listingId,
        buyer_id: gateBuyerId,
        contacted_in_app: true,
        agreed_subtotal_mxn_cents: agreedSubtotalMxnCents,
        seller_set_agreed_price_at: now,
        quote_status: "pending",
        quote_line_items: quoteLineItems.length > 0 ? quoteLineItems : null,
        quote_metadata: quoteMetadata,
        quote_sent_at: now,
        quote_responded_at: null,
        updated_at: now,
      },
      { onConflict: "listing_id,buyer_id" },
    );
    if (upsertErr) {
      console.error("[service-quote/send] upsert", upsertErr);
      return NextResponse.json({ error: "No se pudo guardar la cotización" }, { status: 500 });
    }

    const sentGate = await loadServiceQuoteGate(supabase, listingId, gateBuyerId);
    if (sentGate) {
      try {
        await replicateServiceQuoteGateToBuyerPool(supabase, listingId, gateBuyerId, sentGate);
      } catch (syncErr) {
        console.error("[service-quote/send] pool sync (non-fatal)", syncErr);
      }
    }

    const inserted = await insertListingChatMessage(supabase, conv.id, sellerUserId, messageBody);
    if (!inserted) {
      return NextResponse.json({ error: "Cotización guardada pero no se pudo publicar en el chat" }, { status: 500 });
    }

    try {
      await notifyBuyerServiceQuoteSent({
        supabase,
        buyerId: gateBuyerId,
        listingId,
        listingTitle: String(listing.title_es ?? "Servicio"),
        conversationId: conv.id,
        totalCents: agreedSubtotalMxnCents,
        lang,
        providerSlug: slug,
      });
    } catch (e) {
      console.error("[service-quote/send] buyer WhatsApp failed (non-fatal)", e);
    }

    const buyerPool = await expandUserAccountIdPool(supabase, gateBuyerId);
    const { data: buyerRows } = await supabase
      .from("users")
      .select("display_name,phone")
      .in("id", buyerPool)
      .limit(1);
    const buyerName =
      buyerRows?.[0]?.display_name?.trim() ||
      (buyerRows?.[0]?.phone ? `Cliente …${buyerRows[0].phone.replace(/\D/g, "").slice(-4)}` : "Cliente");

    try {
      await notifySellerQuoteSent({
        supabase,
        sellerId: String(listing.seller_id),
        listingId,
        listingTitle: String(listing.title_es ?? "Servicio"),
        conversationId: conv.id,
        buyerName,
        totalCents: agreedSubtotalMxnCents,
        lang,
      });
    } catch (e) {
      console.error("[service-quote/send] seller WhatsApp failed (non-fatal)", e);
    }

    return NextResponse.json({
      ok: true,
      quoteStatus: "pending",
      agreedSubtotalMxnCents,
      message: inserted,
      conversationId: conv.id,
      sellerConnectReady,
      connectWarning: sellerConnectReady
        ? null
        : lang === "en"
          ? "Quote sent. Activate Stripe Connect in Profile before the job balance can be paid in-app after completion."
          : "Cotización enviada. Activa Stripe Connect en Mi perfil para que el cliente pueda pagar el saldo en la app al terminar el servicio.",
    });
  } catch (e) {
    console.error("[service-quote/send] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
