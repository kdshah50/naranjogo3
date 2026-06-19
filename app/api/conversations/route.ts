import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import {
  expandUserAccountIdPool,
  poolsOverlap,
  userIsListingSellerAccount,
} from "@/lib/user-account-pool";
import { latestTicketsForListingBuyers, MAX_INBOX_THREADS, latestTicketForListingBuyer } from "@/lib/conversation-ticket";

export const dynamic = "force-dynamic";

/** GET ?listingId= — buyer: their thread + messages; seller: all threads for this listing. */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const listingId = req.nextUrl.searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ error: "listingId requerido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const listingIdVariants = idMatchVariantsForIn(listingId);
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id,seller_id,title_es")
      .in("id", listingIdVariants)
      .maybeSingle();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    const sellerId = listing.seller_id as string | null;
    if (!sellerId) {
      return NextResponse.json({ error: "Anuncio sin vendedor" }, { status: 400 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const listingSellerPool = await expandUserAccountIdPool(supabase, sellerId);
    const isListingSeller = poolsOverlap(myPool, listingSellerPool);

    console.log("[conversations] GET userId:", userId, "sellerId:", sellerId, "listingId:", listingId, "isListingSeller:", isListingSeller);

    if (isListingSeller) {
      const listingRowIdVariants = idMatchVariantsForIn(listing.id);
      const { data: convsRaw, error: convErr } = await supabase
        .from("listing_conversations")
        .select("id,buyer_id,seller_id,updated_at,created_at")
        .in("listing_id", listingRowIdVariants)
        .order("updated_at", { ascending: false });

      if (convErr) {
        console.error("[conversations] seller list", convErr);
        return NextResponse.json({ error: "No se pudo cargar conversaciones" }, { status: 500 });
      }

      const buyerPoolCache = new Map<string, string[]>();
      const buyerPoolFor = async (bid: string) => {
        if (!buyerPoolCache.has(bid)) buyerPoolCache.set(bid, await expandUserAccountIdPool(supabase, bid));
        return buyerPoolCache.get(bid)!;
      };

      /** Listing owner sees every buyer thread on this anuncio (even stale `seller_id` on the row). */
      const convs: NonNullable<typeof convsRaw> = [];
      for (const c of convsRaw ?? []) {
        if (poolsOverlap(await buyerPoolFor(c.buyer_id), listingSellerPool)) continue;
        convs.push(c);
      }

      const buyerIds = Array.from(new Set(convs.map((c) => c.buyer_id)));
      const buyerMap: Record<string, { display_name: string | null; phone: string | null }> = {};
      if (buyerIds.length > 0) {
        const expanded = [...new Set(buyerIds.flatMap((bid) => idMatchVariantsForIn(bid)))];
        const { data: buyers } = await supabase.from("users").select("id,display_name,phone").in("id", expanded);
        for (const b of buyers ?? []) {
          buyerMap[b.id.trim().toLowerCase()] = { display_name: b.display_name, phone: b.phone };
        }
      }

      const ticketMap = await latestTicketsForListingBuyers(supabase, listing.id, buyerIds);

      const threads = await Promise.all(
        convs.map(async (c) => {
          const { data: last } = await supabase
            .from("listing_messages")
            .select("body,created_at")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const b = buyerMap[c.buyer_id.trim().toLowerCase()];
          const buyerLabel =
            b?.display_name?.trim() || (b?.phone ? `…${b.phone.replace(/\D/g, "").slice(-4)}` : "Comprador");
          return {
            conversationId: c.id,
            buyer_id: c.buyer_id,
            buyer_name: buyerLabel,
            last_body: last?.body ?? "",
            last_at: last?.created_at ?? c.updated_at,
            ticket_code: ticketMap.get(c.buyer_id.trim().toLowerCase()) ?? null,
          };
        })
      );

      threads.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
      const threadsTotal = threads.length;

      const focusConversationId = req.nextUrl.searchParams.get("conversationId")?.trim();
      let focusConversation: {
        id: string;
        buyer_id: string;
        messages: { id: string; sender_id: string; body: string; created_at: string }[];
      } | null = null;

      if (focusConversationId) {
        const focusNorm = focusConversationId.trim().toLowerCase();
        const focusRow =
          convs.find((c) => c.id.trim().toLowerCase() === focusNorm) ?? null;
        if (focusRow) {
          const { data: focusMessages } = await supabase
            .from("listing_messages")
            .select("id,sender_id,body,created_at")
            .eq("conversation_id", focusRow.id)
            .order("created_at", { ascending: true });
          focusConversation = {
            id: focusRow.id,
            buyer_id: focusRow.buyer_id,
            messages: focusMessages ?? [],
          };
        }
      }

      const visibleThreads = threads.slice(0, MAX_INBOX_THREADS);
      if (focusConversation) {
        const inVisible = visibleThreads.some(
          (t) => t.conversationId.trim().toLowerCase() === focusConversation!.id.trim().toLowerCase(),
        );
        if (!inVisible) {
          const focusThread = threads.find(
            (t) => t.conversationId.trim().toLowerCase() === focusConversation!.id.trim().toLowerCase(),
          );
          if (focusThread) {
            visibleThreads.unshift(focusThread);
            if (visibleThreads.length > MAX_INBOX_THREADS) visibleThreads.pop();
          }
        }
      }

      return NextResponse.json({
        role: "seller",
        listing: { id: listing.id, title_es: listing.title_es },
        threads: visibleThreads,
        threadsTotal,
        hasMoreThreads: threadsTotal > MAX_INBOX_THREADS,
        focusConversation,
      });
    }

    const listingRowIdVariants = idMatchVariantsForIn(listing.id);
    const { data: conv, error: convErr } = await supabase
      .from("listing_conversations")
      .select("id")
      .in("listing_id", listingRowIdVariants)
      .in("buyer_id", myPool)
      .maybeSingle();

    if (convErr) {
      console.error("[conversations] buyer conv", convErr);
      return NextResponse.json({ error: "No se pudo cargar la conversación" }, { status: 500 });
    }

    if (!conv) {
      return NextResponse.json({
        role: "buyer",
        listing: { id: listing.id, title_es: listing.title_es },
        conversation: null,
        messages: [],
        ticket_code: null,
      });
    }

    const { data: messages, error: msgErr } = await supabase
      .from("listing_messages")
      .select("id,sender_id,body,created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });

    if (msgErr) {
      console.error("[conversations] messages", msgErr);
      return NextResponse.json({ error: "No se pudo cargar mensajes" }, { status: 500 });
    }

    const ticketCode = await latestTicketForListingBuyer(supabase, listing.id, userId);

    return NextResponse.json({
      role: "buyer",
      listing: { id: listing.id, title_es: listing.title_es },
      conversation: { id: conv.id },
      messages: messages ?? [],
      ticket_code: ticketCode,
    });
  } catch (e) {
    console.error("[conversations] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/** POST { listingId } — buyer opens thread (idempotent). */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const listingId = String(body?.listingId ?? "");
    if (!listingId) {
      return NextResponse.json({ error: "listingId requerido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const listingIdVars = idMatchVariantsForIn(listingId);
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id,seller_id")
      .in("id", listingIdVars)
      .maybeSingle();

    if (listingError || !listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    const sellerId = listing.seller_id as string | null;
    if (!sellerId) {
      return NextResponse.json({ error: "Anuncio sin vendedor" }, { status: 400 });
    }
    if (await userIsListingSellerAccount(supabase, userId, sellerId)) {
      return NextResponse.json({ error: "No puedes chatear contigo mismo" }, { status: 400 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);

    const listingRowIdVariantsPost = idMatchVariantsForIn(listing.id);
    const { data: existing } = await supabase
      .from("listing_conversations")
      .select("id")
      .in("listing_id", listingRowIdVariantsPost)
      .in("buyer_id", myPool)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ conversationId: existing.id });
    }

    const { data: created, error: insertErr } = await supabase
      .from("listing_conversations")
      .insert({
        listing_id: listing.id,
        buyer_id: userId,
        seller_id: sellerId,
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: row } = await supabase
          .from("listing_conversations")
          .select("id")
          .in("listing_id", listingRowIdVariantsPost)
          .in("buyer_id", myPool)
          .maybeSingle();
        if (row) return NextResponse.json({ conversationId: row.id });
      }
      console.error("[conversations] POST insert", insertErr);
      return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 });
    }

    return NextResponse.json({ conversationId: created.id });
  } catch (e) {
    console.error("[conversations] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
