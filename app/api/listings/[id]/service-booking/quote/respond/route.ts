import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import { loadServiceQuoteGateForBuyerPool, insertListingChatMessage, resolveConversationForBuyer } from "@/lib/service-quote-server";
import { notifySellerQuoteResponded } from "@/lib/service-quote-notify";
import { appendListingChatQuoteAcceptNotice } from "@/lib/payment-confirmed-chat";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/** POST { action: 'accept' | 'decline', note? } — buyer responds to pending quote. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const buyerUserId = await getUserIdFromRequest(req);
    if (!buyerUserId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const listingId = params.id?.trim() ?? "";
    if (!listingId) return NextResponse.json({ error: "listingId inválido" }, { status: 400 });

    const json = await req.json().catch(() => ({}));
    const action = String((json as { action?: string }).action ?? "").trim().toLowerCase();
    const note = String((json as { note?: string }).note ?? "").trim().slice(0, 500) || null;
    const lang = (json as { lang?: string }).lang === "en" ? "en" : "es";

    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action debe ser accept o decline" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id,title_es")
      .eq("id", listingId)
      .maybeSingle();
    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }
    if (await userIsListingSellerAccount(supabase, buyerUserId, listing.seller_id as string)) {
      return NextResponse.json({ error: "El proveedor no puede responder su propia cotización" }, { status: 400 });
    }

    const slug = inferProviderSlugFromListingTitle(listing.title_es as string);
    if (!providerServiceRequiresQuoteAccept(slug)) {
      return NextResponse.json({ error: "Este anuncio no usa flujo de cotización" }, { status: 400 });
    }

    const myPool = await expandUserAccountIdPool(supabase, buyerUserId);
    const gate = await loadServiceQuoteGateForBuyerPool(supabase, listingId, myPool);
    if (!gate || gate.quoteStatus !== "pending") {
      return NextResponse.json({ error: "No hay cotización pendiente para responder" }, { status: 400 });
    }
    if (gate.agreedSubtotalMxnCents == null || gate.agreedSubtotalMxnCents < 100) {
      return NextResponse.json({ error: "Cotización incompleta" }, { status: 400 });
    }

    const conv = await resolveConversationForBuyer(supabase, listingId, buyerUserId);
    if (!conv) {
      return NextResponse.json({ error: "No hay conversación activa" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextStatus = action === "accept" ? "accepted" : "declined";
    const listVars = idMatchVariantsForIn(listingId);

    const { error: upErr } = await supabase
      .from("listing_service_contact_gate")
      .update({
        quote_status: nextStatus,
        quote_responded_at: now,
        updated_at: now,
      })
      .in("listing_id", listVars)
      .in("buyer_id", myPool);

    if (upErr) {
      console.error("[service-quote/respond] update", upErr);
      return NextResponse.json({ error: "No se pudo registrar tu respuesta" }, { status: 500 });
    }

    const totalFmt = (gate.agreedSubtotalMxnCents / 100).toLocaleString(lang === "en" ? "en-MX" : "es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    });

    const messageBody =
      action === "accept"
        ? lang === "en"
          ? `✅ I accept the quote of ${totalFmt}.${note ? ` Note: ${note}` : ""}`
          : `✅ Acepto la cotización de ${totalFmt}.${note ? ` Nota: ${note}` : ""}`
        : lang === "en"
          ? `❌ I decline this quote.${note ? ` Note: ${note}` : ""}`
          : `❌ Rechazo esta cotización.${note ? ` Nota: ${note}` : ""}`;

    const inserted = await insertListingChatMessage(supabase, conv.id, buyerUserId, messageBody);

    if (action === "accept") {
      await appendListingChatQuoteAcceptNotice(supabase, {
        listingId,
        buyerId: buyerUserId,
        conversationId: conv.id,
        totalFormatted: totalFmt,
      });
    }

    const { data: buyerRow } = await supabase
      .from("users")
      .select("display_name")
      .in("id", idMatchVariantsForIn(buyerUserId))
      .maybeSingle();

    void notifySellerQuoteResponded({
      supabase,
      sellerId: String(listing.seller_id),
      listingId,
      listingTitle: String(listing.title_es ?? "Servicio"),
      conversationId: conv.id,
      buyerName: String(buyerRow?.display_name ?? "Cliente"),
      status: nextStatus,
      totalCents: gate.agreedSubtotalMxnCents,
      lang,
    });

    return NextResponse.json({
      ok: true,
      quoteStatus: nextStatus,
      agreedSubtotalMxnCents: gate.agreedSubtotalMxnCents,
      canPayDeposit: action === "accept",
      message: inserted,
    });
  } catch (e) {
    console.error("[service-quote/respond] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
