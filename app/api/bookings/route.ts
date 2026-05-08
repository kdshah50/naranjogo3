import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { SERVICE_BOOKING_LIST_COLUMNS } from "@/lib/booking-list-select";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

type BookingRow = Record<string, unknown>;

/** Paid bookings must sort by settlement time — row `created_at` is checkout start and can be much older than `paid_at`. */
const PAID_BOOKING_LIST_LIMIT = 100;

function cmpRecentBookingActivity(a: BookingRow, b: BookingRow): number {
  const pa = a.paid_at ? new Date(String(a.paid_at)).getTime() : 0;
  const pb = b.paid_at ? new Date(String(b.paid_at)).getTime() : 0;
  if (pb !== pa) return pb - pa;
  return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
}

/**
 * GET /api/bookings?status=paid
 * GET /api/bookings?seller=1&status=paid — authenticated seller's paid bookings (mark complete UI).
 *
 * Seller: merge rows where `seller_id` is in the provider pool with rows for any `listing_id`
 * the provider owns. Fixes missing UI when `service_bookings.seller_id` drifted from listing owner.
 *
 * Buyer: merge rows where `buyer_id` is in the buyer pool with paid rows on `listing_id`s from
 * `listing_conversations` when `expandRow(buyer_id)` overlaps the pool (stale `buyer_id` on booking).
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const statusFilter = req.nextUrl.searchParams.get("status");
  const sellerMode = req.nextUrl.searchParams.get("seller") === "1" || req.nextUrl.searchParams.get("seller") === "true";

  const supabase = createAdminSupabase();

  let bookingRows: BookingRow[] = [];
  let sellerStrikeCount: number | undefined;

  if (sellerMode) {
    const pool = await expandUserAccountIdPool(supabase, userId);

    const { data: strikeRow } = await supabase
      .from("users")
      .select("provider_strike_count")
      .in("id", pool)
      .limit(1)
      .maybeSingle();
    sellerStrikeCount = strikeRow?.provider_strike_count ?? 0;

    let qBySeller = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("seller_id", pool);
    if (statusFilter === "paid") {
      qBySeller = qBySeller
        .eq("payment_status", "paid")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      qBySeller = qBySeller.order("created_at", { ascending: false });
    }
    qBySeller = qBySeller.limit(PAID_BOOKING_LIST_LIMIT);
    const { data: bySellerId, error: err1 } = await qBySeller;
    if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

    const { data: listingRows } = await supabase.from("listings").select("id").in("seller_id", pool);
    const listingIds = [...new Set((listingRows ?? []).map((r) => String(r.id)))];

    let byListing: NonNullable<typeof bySellerId> = [];
    if (listingIds.length > 0) {
      let qByList = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("listing_id", listingIds);
      if (statusFilter === "paid") {
        qByList = qByList
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
      } else {
        qByList = qByList.order("created_at", { ascending: false });
      }
      qByList = qByList.limit(PAID_BOOKING_LIST_LIMIT);
      const { data: bl, error: err2 } = await qByList;
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });
      byListing = bl ?? [];
    }

    const merged = new Map<string, BookingRow>();
    for (const row of [...(bySellerId ?? []), ...byListing]) {
      merged.set(String(row.id), row as BookingRow);
    }
    bookingRows = [...merged.values()].sort((a, b) =>
      statusFilter === "paid" ? cmpRecentBookingActivity(a, b) : new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
    );
    if (bookingRows.length > PAID_BOOKING_LIST_LIMIT) {
      bookingRows = bookingRows.slice(0, PAID_BOOKING_LIST_LIMIT);
    }
  } else {
    const buyerPool = await expandUserAccountIdPool(supabase, userId);

    let query = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("buyer_id", buyerPool);
    if (statusFilter === "paid") {
      query = query
        .eq("payment_status", "paid")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }
    query = query.limit(PAID_BOOKING_LIST_LIMIT);
    const { data: byBuyerId, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const mergedBuy = new Map<string, BookingRow>();
    for (const row of byBuyerId ?? []) mergedBuy.set(String(row.id), row as BookingRow);

    const { data: convs } = await supabase
      .from("listing_conversations")
      .select("listing_id")
      .in("buyer_id", buyerPool)
      .limit(200);

    const listingKeys = [...new Set((convs ?? []).map((c) => String(c.listing_id)))].slice(0, 120);
    const listingIdVariants = [...new Set(listingKeys.flatMap((id) => idMatchVariantsForIn(id)))];

    if (listingIdVariants.length > 0) {
      let qByListing = supabase
        .from("service_bookings")
        .select(SERVICE_BOOKING_LIST_COLUMNS)
        .in("listing_id", listingIdVariants);
      if (statusFilter === "paid") {
        qByListing = qByListing
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
      } else {
        qByListing = qByListing.order("created_at", { ascending: false });
      }
      qByListing = qByListing.limit(PAID_BOOKING_LIST_LIMIT);
      const { data: byListingRows, error: err2 } = await qByListing;
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });

      const bookingBuyerExpandCache = new Map<string, string[]>();
      const poolForBookingBuyer = async (buyerId: string) => {
        if (!bookingBuyerExpandCache.has(buyerId)) {
          bookingBuyerExpandCache.set(buyerId, await expandUserAccountIdPool(supabase, buyerId));
        }
        return bookingBuyerExpandCache.get(buyerId)!;
      };

      for (const row of byListingRows ?? []) {
        if (mergedBuy.has(String(row.id))) continue;
        const rowBuyerPool = await poolForBookingBuyer(String(row.buyer_id));
        if (poolsOverlap(rowBuyerPool, buyerPool)) mergedBuy.set(String(row.id), row as BookingRow);
      }
    }

    bookingRows = [...mergedBuy.values()].sort((a, b) =>
      statusFilter === "paid"
        ? cmpRecentBookingActivity(a, b)
        : new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
    );
    if (bookingRows.length > PAID_BOOKING_LIST_LIMIT) {
      bookingRows = bookingRows.slice(0, PAID_BOOKING_LIST_LIMIT);
    }
  }

  const bookingIds = bookingRows.map((b) => String(b.id));
  const reviewedSet = new Set<string>();
  if (bookingIds.length > 0) {
    const { data: revRows } = await supabase
      .from("seller_reviews")
      .select("booking_id")
      .in("booking_id", bookingIds);
    for (const r of revRows ?? []) {
      if (r.booking_id) reviewedSet.add(r.booking_id);
    }
  }

  const enriched = await Promise.all(
    bookingRows.map(async (b) => {
      const listingIdVars = idMatchVariantsForIn(String(b.listing_id));
      const { data: listing } = await supabase
        .from("listings")
        .select("title_es")
        .in("id", listingIdVars)
        .maybeSingle();

      let buyer_name = "Comprador";
      let seller_name = "Proveedor";
      if (sellerMode) {
        const buyerPoolRow = await expandUserAccountIdPool(supabase, String(b.buyer_id));
        const { data: buyerRows } = await supabase
          .from("users")
          .select("display_name")
          .in("id", buyerPoolRow)
          .limit(1);
        buyer_name = buyerRows?.[0]?.display_name?.trim() || "Comprador";
      } else {
        const sellerPoolRow = await expandUserAccountIdPool(supabase, String(b.seller_id));
        const { data: sellerRows } = await supabase
          .from("users")
          .select("display_name")
          .in("id", sellerPoolRow)
          .limit(1);
        seller_name = sellerRows?.[0]?.display_name?.trim() || "Proveedor";
      }

      return {
        ...b,
        has_review: reviewedSet.has(String(b.id)),
        listing_title: listing?.title_es ?? "Servicio",
        ...(sellerMode ? { buyer_name } : { seller_name }),
      };
    })
  );

  return NextResponse.json({
    bookings: enriched,
    ...(sellerMode && sellerStrikeCount !== undefined ? { sellerStrikeCount } : {}),
  });
}
