import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { parseServiceMenu } from "@/lib/listing-service-menu";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import {
  buildMenuQuoteMessage,
  computeQuoteTotalCents,
} from "@/lib/service-quote";
import {
  buyerContactFromMetadata,
  formatBuyerContactBlock,
} from "@/lib/buyer-quote-contact";
import {
  insertListingChatMessage,
  loadServiceQuoteGate,
  resolveConversationForBuyer,
} from "@/lib/service-quote-server";
import { notifySellerBuyerServiceRequest } from "@/lib/service-quote-notify";
import { quoteLayoutForSlug } from "@/lib/service-quote-vertical";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/** POST — buyer re-sends last cleaning request from saved gate line items (one-tap rebook). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const buyerUserId = await getUserIdFromRequest(req);
    if (!buyerUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const listingId = params.id?.trim() ?? "";
    if (!listingId) return NextResponse.json({ error: "listingId inválido" }, { status: 400 });

    const json = await req.json().catch(() => ({}));
    const lang = (json as { lang?: string }).lang === "en" ? "en" : "es";

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
      return NextResponse.json({ error: "No puedes reservar tu propio servicio" }, { status: 400 });
    }

    const slug = inferProviderSlugFromListingTitle(listing.title_es as string);
    if (!providerServiceRequiresQuoteAccept(slug)) {
      return NextResponse.json({ error: "Rebook no disponible para este anuncio" }, { status: 400 });
    }

    const buyerPool = await expandUserAccountIdPool(supabase, buyerUserId);
    let gate = null;
    for (const bid of buyerPool) {
      gate = await loadServiceQuoteGate(supabase, listingId, bid);
      if (gate?.quoteLineItems?.length) break;
    }
    const lineItems = gate?.quoteLineItems ?? [];
    if (lineItems.length === 0) {
      return NextResponse.json(
        {
          error: "no_prior_request",
          message:
            lang === "en"
              ? "No saved cleaning request found — open the listing and send a new request."
              : "No hay solicitud guardada — abre el anuncio y envía una nueva solicitud.",
        },
        { status: 400 },
      );
    }

    const parsedMenu = parseServiceMenu(listing.service_menu);
    if (!parsedMenu.ok) {
      return NextResponse.json({ error: "Menú de servicio no disponible" }, { status: 400 });
    }

    const quoteMetadata = gate?.quoteMetadata ?? { kind: "buyer_request" as const, lang };
    quoteMetadata.kind = "buyer_request";
    quoteMetadata.lang = lang;

    const cartLines = lineItems.map((x) => ({ sku: x.sku, qty: x.qty }));
    const totalCents = computeQuoteTotalCents({
      menu: parsedMenu.menu,
      cartLines,
      visitFrequency: quoteMetadata.visitFrequency,
      quoteBasis: quoteMetadata.quoteBasis,
      quoteLayout: quoteLayoutForSlug(slug),
    });

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
        return NextResponse.json({ error: "No se pudo iniciar conversación" }, { status: 500 });
      }
      conv = { id: String(created.id), buyer_id: String(created.buyer_id ?? buyerUserId) };
    }

    let messageBody = buildMenuQuoteMessage({
      menu: parsedMenu.menu,
      lineItems,
      totalCents,
      lang,
      visitFrequency: quoteMetadata.visitFrequency,
      quoteBasis: quoteMetadata.quoteBasis,
      headerKind: "buyer_request",
    });
    messageBody +=
      lang === "en"
        ? "\n\n🔄 Repeat booking — same services as last time."
        : "\n\n🔄 Reserva repetida — mismos servicios que la última vez.";
    const savedContact = buyerContactFromMetadata(quoteMetadata);
    if (savedContact) {
      messageBody += `\n\n${formatBuyerContactBlock(savedContact, lang)}`;
    }
    if (quoteMetadata.buyerNotes) {
      messageBody += lang === "en" ? `\n\nNotes: ${quoteMetadata.buyerNotes}` : `\n\nNotas: ${quoteMetadata.buyerNotes}`;
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

    const { data: buyerRow } = await supabase
      .from("users")
      .select("display_name")
      .in("id", idMatchVariantsForIn(buyerUserId))
      .maybeSingle();

    void notifySellerBuyerServiceRequest({
      supabase,
      sellerId: String(listing.seller_id),
      listingId,
      listingTitle: String(listing.title_es ?? "Servicio"),
      buyerName: savedContact
        ? `${savedContact.firstName} ${savedContact.lastName}`.trim()
        : String(buyerRow?.display_name ?? "Cliente"),
      conversationId: conv.id,
      totalCents,
      lang,
      providerSlug: slug,
    });

    return NextResponse.json({
      ok: true,
      conversationId: conv.id,
      listingId,
      redirectUrl: `/listing/${listingId}?quote=1`,
    });
  } catch (e) {
    console.error("[service-quote/rebook] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
