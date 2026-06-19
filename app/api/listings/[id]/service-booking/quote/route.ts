import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { providerServiceRequiresQuoteAccept } from "@/lib/provider-services";
import { loadServiceQuoteGate, loadServiceQuoteGateForBuyerPool } from "@/lib/service-quote-server";
import { expandUserAccountIdPool, userIsListingSellerAccount } from "@/lib/user-account-pool";
import { quoteLayoutForSlug } from "@/lib/service-quote-vertical";

export const dynamic = "force-dynamic";

/** GET ?buyerId= (seller) — quote state for listing+buyer. Buyer omits buyerId. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const listingId = params.id?.trim() ?? "";
    if (!listingId) return NextResponse.json({ error: "listingId inválido" }, { status: 400 });

    const supabase = createAdminSupabase();
    const listingIdVars = idMatchVariantsForIn(listingId);
    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,seller_id,title_es")
      .in("id", listingIdVars)
      .maybeSingle();
    if (le || !listing?.seller_id) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    const slug = inferProviderSlugFromListingTitle(listing.title_es as string);
    const requiresQuoteAccept = providerServiceRequiresQuoteAccept(slug);
    const quoteLayout = quoteLayoutForSlug(slug);

    const buyerIdParam = req.nextUrl.searchParams.get("buyerId")?.trim() ?? "";
    const isSeller = await userIsListingSellerAccount(supabase, userId, listing.seller_id as string);

    let buyerId = userId;
    if (isSeller) {
      if (!buyerIdParam) {
        return NextResponse.json({ error: "buyerId requerido para el proveedor" }, { status: 400 });
      }
      buyerId = buyerIdParam;
    } else if (buyerIdParam && buyerIdParam !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const gate = isSeller
      ? await loadServiceQuoteGate(supabase, listingId, buyerId)
      : await loadServiceQuoteGateForBuyerPool(
          supabase,
          listingId,
          await expandUserAccountIdPool(supabase, userId),
        );

    return NextResponse.json({
      requiresQuoteAccept,
      quoteLayout,
      providerSlug: slug,
      quoteStatus: gate?.quoteStatus ?? "none",
      agreedSubtotalMxnCents: gate?.agreedSubtotalMxnCents ?? null,
      sellerSetAgreedPriceAt: gate?.sellerSetAgreedPriceAt ?? null,
      quoteLineItems: gate?.quoteLineItems ?? null,
      quoteMetadata: gate?.quoteMetadata ?? null,
      quoteSentAt: gate?.quoteSentAt ?? null,
      quoteRespondedAt: gate?.quoteRespondedAt ?? null,
      canPayDeposit:
        requiresQuoteAccept && gate
          ? gate.quoteStatus === "accepted"
          : true,
    });
  } catch (e) {
    console.error("[service-quote] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
