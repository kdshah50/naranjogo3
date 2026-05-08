import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn, isSameUserId } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  updated_at: string;
};

function labelUser(u: { display_name: string | null; phone: string | null } | undefined) {
  if (!u) return "Usuario";
  if (u.display_name?.trim()) return u.display_name.trim();
  const d = u.phone?.replace(/\D/g, "") ?? "";
  return d.length >= 4 ? `…${d.slice(-4)}` : "Usuario";
}

/** All threads where current user is buyer or seller (for /messages inbox). */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const myPool = await expandUserAccountIdPool(supabase, userId);

    const [{ data: asBuyer, error: e1 }, { data: asSellerByColumn, error: e2 }, { data: ownedListings, error: e3 }] =
      await Promise.all([
        supabase
          .from("listing_conversations")
          .select("id,listing_id,buyer_id,seller_id,updated_at")
          .in("buyer_id", myPool)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("listing_conversations")
          .select("id,listing_id,buyer_id,seller_id,updated_at")
          .in("seller_id", myPool)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase.from("listings").select("id").in("seller_id", myPool).limit(200),
      ]);

    if (e1 || e2) {
      console.error("[conversations/inbox]", e1, e2);
      return NextResponse.json({ error: "No se pudo cargar el inbox" }, { status: 500 });
    }
    if (e3) {
      console.error("[conversations/inbox] owned listings", e3);
    }

    /** Stale `seller_id` on row still same person via phone-linked id pool (see /api/conversations listing seller branch). */
    const ownedListingIdVariants = [
      ...new Set((ownedListings ?? []).flatMap((l) => idMatchVariantsForIn(l.id))),
    ];
    const asSellerFromOwned: Row[] = [];
    if (ownedListingIdVariants.length > 0) {
      const { data: convRows, error: e4 } = await supabase
        .from("listing_conversations")
        .select("id,listing_id,buyer_id,seller_id,updated_at")
        .in("listing_id", ownedListingIdVariants)
        .order("updated_at", { ascending: false })
        .limit(80);
      if (e4) {
        console.error("[conversations/inbox] conversations on owned listings", e4);
      } else {
        const sellerPoolCache = new Map<string, string[]>();
        for (const r of convRows ?? []) {
          const sid = r.seller_id;
          if (!sellerPoolCache.has(sid)) {
            sellerPoolCache.set(sid, await expandUserAccountIdPool(supabase, sid));
          }
          if (poolsOverlap(sellerPoolCache.get(sid)!, myPool)) {
            asSellerFromOwned.push(r as Row);
          }
        }
      }
    }

    const seen = new Set<string>();
    const merged = [...(asBuyer ?? []), ...(asSellerByColumn ?? []), ...asSellerFromOwned] as Row[];
    const all = merged.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    const bogus = await Promise.all(
      all.map(async (r) => {
        const [bp, sp] = await Promise.all([
          expandUserAccountIdPool(supabase, r.buyer_id),
          expandUserAccountIdPool(supabase, r.seller_id),
        ]);
        return poolsOverlap(bp, sp);
      })
    );
    const filtered = all.filter((_, i) => !bogus[i]);

    const listingIds = Array.from(new Set(filtered.flatMap((r) => idMatchVariantsForIn(r.listing_id))));
    const userIds = Array.from(new Set(filtered.flatMap((r) => [r.buyer_id, r.seller_id])));

    const listingMap: Record<string, { title_es: string | null }> = {};
    if (listingIds.length > 0) {
      const { data: listings } = await supabase.from("listings").select("id,title_es").in("id", listingIds);
      for (const l of listings ?? []) {
        for (const v of idMatchVariantsForIn(l.id)) {
          listingMap[v] = { title_es: l.title_es };
        }
      }
    }

    let otherUsers: { id: string; display_name: string | null; phone: string | null }[] = [];
    if (userIds.length > 0) {
      const idUnion = Array.from(new Set(userIds.flatMap((id) => idMatchVariantsForIn(id))));
      const { data: users } = await supabase
        .from("users")
        .select("id,display_name,phone")
        .in("id", idUnion);
      otherUsers = users ?? [];
    }
    const userById = (id: string) => otherUsers.find((u) => isSameUserId(u.id, id));

    const buyerPoolCache = new Map<string, string[]>();
    const buyerPoolFor = async (bid: string) => {
      if (!buyerPoolCache.has(bid)) buyerPoolCache.set(bid, await expandUserAccountIdPool(supabase, bid));
      return buyerPoolCache.get(bid)!;
    };

    const enriched = await Promise.all(
      filtered.map(async (r) => {
        const { data: last } = await supabase
          .from("listing_messages")
          .select("body,created_at")
          .eq("conversation_id", r.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const isBuyer = poolsOverlap(myPool, await buyerPoolFor(r.buyer_id));
        const otherId = isBuyer ? r.seller_id : r.buyer_id;
        return {
          conversationId: r.id,
          listing_id: r.listing_id,
          listing_title: listingMap[r.listing_id]?.title_es ?? "Anuncio",
          role: isBuyer ? ("buyer" as const) : ("seller" as const),
          other_user_id: otherId,
          other_name: labelUser(userById(otherId)),
          last_body: last?.body ?? "",
          last_at: last?.created_at ?? r.updated_at,
        };
      })
    );

    enriched.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

    return NextResponse.json({ threads: enriched });
  } catch (e) {
    console.error("[conversations/inbox] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
