import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { SERVICE_BOOKING_LIST_COLUMNS } from "@/lib/booking-list-select";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

type BookingRow = Record<string, unknown>;

/**
 * GET /api/bookings?status=paid
 * GET /api/bookings?seller=1&status=paid — authenticated seller's paid bookings (mark complete UI).
 *
 * Seller: merge rows where `seller_id` is in the provider pool with rows for any `listing_id`
 * the provider owns. Fixes missing UI when `service_bookings.seller_id` drifted from listing owner.
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

    let qBySeller = supabase
      .from("service_bookings")
      .select(SERVICE_BOOKING_LIST_COLUMNS)
      .in("seller_id", pool)
      .order("created_at", { ascending: false })
      .limit(50);
    if (statusFilter === "paid") qBySeller = qBySeller.eq("payment_status", "paid");
    const { data: bySellerId, error: err1 } = await qBySeller;
    if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

    const { data: listingRows } = await supabase.from("listings").select("id").in("seller_id", pool);
    const listingIds = [...new Set((listingRows ?? []).map((r) => String(r.id)))];

    let byListing: NonNullable<typeof bySellerId> = [];
    if (listingIds.length > 0) {
      let qByList = supabase
        .from("service_bookings")
        .select(SERVICE_BOOKING_LIST_COLUMNS)
        .in("listing_id", listingIds)
        .order("created_at", { ascending: false })
        .limit(50);
      if (statusFilter === "paid") qByList = qByList.eq("payment_status", "paid");
      const { data: bl, error: err2 } = await qByList;
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });
      byListing = bl ?? [];
    }

    const merged = new Map<string, BookingRow>();
    for (const row of [...(bySellerId ?? []), ...byListing]) {
      merged.set(String(row.id), row as BookingRow);
    }
    bookingRows = [...merged.values()].sort(
      (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
    );
    if (bookingRows.length > 50) bookingRows = bookingRows.slice(0, 50);
  } else {
    let query = supabase
      .from("service_bookings")
      .select(SERVICE_BOOKING_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50);
    const buyerPool = await expandUserAccountIdPool(supabase, userId);
    query = query.in("buyer_id", buyerPool);
    if (statusFilter === "paid") {
      query = query.eq("payment_status", "paid");
    }
    const { data: bookings, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    bookingRows = (bookings ?? []) as BookingRow[];
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
      const { data: listing } = await supabase
        .from("listings")
        .select("title_es")
        .eq("id", b.listing_id)
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
