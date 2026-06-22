import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { buyerHasSentInAppMessage, ensureContactGateFromMessages } from "@/lib/contact-gate";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { resolveListingServiceMenu } from "@/lib/listing-service-menu";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import {
  buildMenuQuoteMessage,
  computeQuoteTotalCents,
  lineItemsFromCart,
  parseQuoteMetadata,
  type ServiceQuoteLineItem,
} from "@/lib/service-quote";
import {
  formatBuyerContactBlock,
  metadataFromBuyerContact,
  parseBuyerQuoteContactFromBody,
  validateBuyerQuoteContact,
} from "@/lib/buyer-quote-contact";
import {
  insertListingChatMessage,
  loadServiceQuoteGate,
  replicateServiceQuoteGateToBuyerPool,
  resolveConversationForBuyer,
} from "@/lib/service-quote-server";
import { notifySellerBuyerServiceRequest, notifyBuyerServiceRequestSent } from "@/lib/service-quote-notify";
import { quoteLayoutForSlug } from "@/lib/service-quote-vertical";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/** POST — buyer sends structured cleaning request from menu picker. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const buyerUserId = await getUserIdFromRequest(req);
    if (!buyerUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const listingId = params.id?.trim() ?? "";
    if (!listingId) return NextResponse.json({ error: "listingId inválido" }, { status: 400 });

    const json = await req.json().catch(() => ({}));
    const cartLines = Array.isArray((json as { cartLines?: unknown }).cartLines)
      ? ((json as { cartLines: Array<{ sku?: string; qty?: number }> }).cartLines ?? [])
          .map((x) => ({ sku: String(x.sku ?? ""), qty: Math.round(Number(x.qty)) }))
          .filter((x) => x.sku && x.qty > 0)
      : [];
    const visitFrequency = (json as { visitFrequency?: string }).visitFrequency;
    const quoteBasis = (json as { quoteBasis?: string }).quoteBasis;
    const buyerNotes = String((json as { buyerNotes?: string }).buyerNotes ?? "").trim().slice(0, 500) || null;
    const lang = (json as { lang?: string }).lang === "en" ? "en" : "es";

    const buyerContact = parseBuyerQuoteContactFromBody((json as { buyerContact?: unknown }).buyerContact);
    if (!buyerContact) {
      const partial = (json as { buyerContact?: Record<string, unknown> }).buyerContact ?? {};
      const errMsg =
        validateBuyerQuoteContact(
          {
            firstName: String(partial.firstName ?? ""),
            lastName: String(partial.lastName ?? ""),
            contactPhone: String(partial.contactPhone ?? ""),
            whatsappPhone: partial.whatsappPhone != null ? String(partial.whatsappPhone) : null,
            serviceAddress: String(partial.serviceAddress ?? ""),
            preferredAt: partial.preferredAt ? String(partial.preferredAt) : "",
          },
          lang,
        ) ??
        (lang === "en"
          ? "Complete all required contact fields before requesting a quote."
          : "Completa todos los datos de contacto antes de solicitar cotización.");
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    if (cartLines.length === 0) {
      return NextResponse.json({ error: "Selecciona al menos un servicio" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id,title_es,service_menu,status")
      .eq("id", listingId)
      .maybeSingle();
    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }
    if (listing.status !== "active") {
      return NextResponse.json({ error: "Este anuncio no está activo" }, { status: 400 });
    }
    if (await userIsListingSellerAccount(supabase, buyerUserId, listing.seller_id as string)) {
      return NextResponse.json({ error: "No puedes solicitar tu propio servicio" }, { status: 400 });
    }

    const slug = inferProviderSlugFromListingTitle(listing.title_es as string);
    if (!providerServiceRequiresQuoteAccept(slug)) {
      return NextResponse.json({ error: "Este anuncio no usa solicitud estructurada" }, { status: 400 });
    }

    const parsedMenu = resolveListingServiceMenu(listing.service_menu, slug);
    if (!parsedMenu.ok) {
      return NextResponse.json({ error: parsedMenu.error || "Menú de servicio no disponible" }, { status: 400 });
    }

    const lineItems = lineItemsFromCart(parsedMenu.menu, cartLines);
    if (lineItems.length === 0) {
      return NextResponse.json({ error: "Servicios seleccionados inválidos" }, { status: 400 });
    }

    const totalCents = computeQuoteTotalCents({
      menu: parsedMenu.menu,
      cartLines,
      visitFrequency: visitFrequency as never,
      quoteBasis: quoteBasis as never,
      quoteLayout: quoteLayoutForSlug(slug),
    });
    if (totalCents < 100) {
      return NextResponse.json({ error: "Total estimado inválido" }, { status: 400 });
    }

    let conv = await resolveConversationForBuyer(supabase, listingId, buyerUserId);
    if (!conv) {
      const { data: created, error: cErr } = await supabase
        .from("listing_conversations")
        .insert({
          listing_id: listingId,
          buyer_id: buyerUserId,
          seller_id: listing.seller_id,
        })
        .select("id,buyer_id")
        .single();
      if (cErr || !created?.id) {
        console.error("[service-quote/request] create conv", cErr);
        return NextResponse.json({ error: "No se pudo iniciar conversación" }, { status: 500 });
      }
      conv = { id: String(created.id), buyer_id: String(created.buyer_id ?? buyerUserId) };
    }

    await ensureContactGateFromMessages(supabase, listingId, conv.buyer_id);
    const sent = await buyerHasSentInAppMessage(supabase, listingId, buyerUserId);
    if (!sent) {
      /* first message below will satisfy gate via messages route side effects */
    }

    const quoteMetadata = parseQuoteMetadata({
      visitFrequency,
      quoteBasis,
      buyerNotes,
      lang,
      kind: "buyer_request",
      ...metadataFromBuyerContact(buyerContact),
    }) ?? { kind: "buyer_request" as const, lang, buyerNotes, ...metadataFromBuyerContact(buyerContact) };

    let messageBody = buildMenuQuoteMessage({
      menu: parsedMenu.menu,
      lineItems,
      totalCents,
      lang,
      visitFrequency: visitFrequency as never,
      quoteBasis: quoteBasis as never,
      headerKind: "buyer_request",
    });
    messageBody += `\n\n${formatBuyerContactBlock(buyerContact, lang)}`;
    if (buyerNotes) {
      messageBody += lang === "en" ? `\n\nNotes: ${buyerNotes}` : `\n\nNotas: ${buyerNotes}`;
    }

    const inserted = await insertListingChatMessage(supabase, conv.id, buyerUserId, messageBody);
    if (!inserted) {
      return NextResponse.json({ error: "No se pudo enviar la solicitud" }, { status: 500 });
    }

    const now = new Date().toISOString();
    await supabase.from("listing_service_contact_gate").upsert(
      {
        listing_id: listingId,
        buyer_id: conv.buyer_id,
        contacted_in_app: true,
        quote_metadata: quoteMetadata,
        quote_line_items: lineItems,
        quote_status: "none",
        agreed_subtotal_mxn_cents: null,
        quote_sent_at: null,
        quote_responded_at: null,
        updated_at: now,
      },
      { onConflict: "listing_id,buyer_id" },
    );

    const savedGate = await loadServiceQuoteGate(supabase, listingId, conv.buyer_id);
    if (savedGate) {
      try {
        await replicateServiceQuoteGateToBuyerPool(supabase, listingId, conv.buyer_id, savedGate);
      } catch (syncErr) {
        console.error("[service-quote/request] pool sync (non-fatal)", syncErr);
      }
    }

    try {
      await notifySellerBuyerServiceRequest({
        supabase,
        sellerId: String(listing.seller_id),
        listingId,
        listingTitle: String(listing.title_es ?? "Servicio"),
        conversationId: conv.id,
        buyerName: `${buyerContact.firstName} ${buyerContact.lastName}`.trim(),
        totalCents,
        lang,
        providerSlug: slug,
      });
    } catch (e) {
      console.error("[service-quote/request] seller WhatsApp failed (non-fatal)", e);
    }

    try {
      await notifyBuyerServiceRequestSent({
        supabase,
        buyerId: conv.buyer_id,
        listingId,
        listingTitle: String(listing.title_es ?? "Servicio"),
        conversationId: conv.id,
        totalCents,
        lang,
        providerSlug: slug,
      });
    } catch (e) {
      console.error("[service-quote/request] buyer WhatsApp failed (non-fatal)", e);
    }

    return NextResponse.json({
      ok: true,
      conversationId: conv.id,
      estimatedTotalCents: totalCents,
      message: inserted,
    });
  } catch (e) {
    console.error("[service-quote/request] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
