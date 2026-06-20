import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
} from "@/lib/auth-server";
import { buyerContactFromMetadata, buyerContactPrefillFromMetadata } from "@/lib/buyer-quote-contact";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import { loadServiceQuoteGate, prepareQuoteGateForRebook } from "@/lib/service-quote-server";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/** POST — prepare gate for rebook: prefill contact + menu, show buyer form (no auto-submit). */
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
      .select("id,seller_id,title_es,status")
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
    let savedGate = null;
    for (const bid of buyerPool) {
      const row = await loadServiceQuoteGate(supabase, listingId, bid);
      if (
        (row?.quoteLineItems?.length ?? 0) > 0 ||
        buyerContactFromMetadata(row?.quoteMetadata) ||
        buyerContactPrefillFromMetadata(row?.quoteMetadata) ||
        (row?.quoteMetadata?.rebookPrefillLineItems?.length ?? 0) > 0
      ) {
        savedGate = row;
        break;
      }
    }

    if (!savedGate) {
      await prepareQuoteGateForRebook(supabase, listingId, buyerUserId);
      const langQ = lang === "en" ? "lang=en&" : "";
      return NextResponse.json({
        ok: true,
        listingId,
        freshStart: true,
        redirectUrl: `/listing/${listingId}?${langQ}rebook=1#listing-inapp-chat`,
      });
    }

    await prepareQuoteGateForRebook(supabase, listingId, buyerUserId);

    const langQ = lang === "en" ? "lang=en&" : "";
    return NextResponse.json({
      ok: true,
      listingId,
      redirectUrl: `/listing/${listingId}?${langQ}rebook=1#listing-inapp-chat`,
    });
  } catch (e) {
    console.error("[service-quote/rebook] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
