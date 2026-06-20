import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
} from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap, userParticipatesInConversation } from "@/lib/user-account-pool";
import { latestTicketForListingBuyer } from "@/lib/conversation-ticket";
import { listConversationMessages } from "@/lib/listing-messages-server";

export const dynamic = "force-dynamic";

/** GET — full thread if participant. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const conversationId = params.id;
    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(conversationId);

    const { data: conv, error: convErr } = await supabase
      .from("listing_conversations")
      .select("id,listing_id,buyer_id,seller_id,updated_at")
      .in("id", idVars)
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const allowed = await userParticipatesInConversation(
      supabase,
      userId,
      conv.buyer_id,
      conv.seller_id,
      conv.listing_id,
    );
    if (!allowed) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const convRowId = conv.id;

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const sellerPool = await expandUserAccountIdPool(supabase, conv.seller_id);

    const { data: listing } = await supabase
      .from("listings")
      .select("id,title_es,seller_id,category_id,service_menu")
      .in("id", idMatchVariantsForIn(conv.listing_id))
      .maybeSingle();

    const listingSellerPool = listing?.seller_id
      ? await expandUserAccountIdPool(supabase, String(listing.seller_id))
      : [];
    const isSeller =
      poolsOverlap(myPool, sellerPool) || poolsOverlap(myPool, listingSellerPool);

    const messages = await listConversationMessages(supabase, convRowId);

    const otherId = isSeller ? conv.buyer_id : conv.seller_id;
    let otherName = "";
    if (otherId) {
      const { data: otherUser } = await supabase
        .from("users")
        .select("display_name,phone")
        .in("id", idMatchVariantsForIn(otherId))
        .maybeSingle();
      otherName = otherUser?.display_name?.trim()
        || (otherUser?.phone ? `…${otherUser.phone.replace(/\D/g, "").slice(-4)}` : "");
    }

    const ticketCode = await latestTicketForListingBuyer(supabase, conv.listing_id, conv.buyer_id);

    return NextResponse.json({
      conversation: conv,
      listing: listing ?? { id: conv.listing_id, title_es: "", seller_id: conv.seller_id },
      messages: messages ?? [],
      role: isSeller ? "seller" : "buyer",
      other_name: otherName,
      ticket_code: ticketCode,
    });
  } catch (e) {
    console.error("[conversations/:id] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
