import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { canonicalBookingRowIdKey, mergeBookingListRowsPreferTruth } from "@/lib/booking-list-merge";
import { SERVICE_BOOKING_LIST_COLUMNS } from "@/lib/booking-list-select";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { getSellerAccountBookingCounts } from "@/lib/seller-platform-stats";
import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";
import { enrichBookingListRows, loadReviewedBookingIdSet } from "@/lib/api-bookings-enrich";
import { applyServiceBookingStatusTruthPass } from "@/lib/booking-status-truth";
import { sellerCanManagePaidBookingRow } from "@/lib/seller-booking-access";

export const dynamic = "force-dynamic";

type BookingRow = Record<string, unknown>;

/** Seller paid list can cross many listings; 100/branch drops newer rows before merge. */
const SELLER_PAID_FETCH_CAP = 350;
const SELLER_PAID_RESPONSE_CAP = 220;

/**
 * Paid rows still in an open phase — must be merged even when `paid_at` is old, otherwise they drop
 * out of the recency-capped `bySeller`/`byListing` fetches while `sellerActivePaidBookings` counts them.
 * Cap bounds pathological accounts; normal providers have few concurrent actives.
 */
const SELLER_ACTIVE_PAID_FETCH_CAP = 400;
const SELLER_ACTIVE_LIFECYCLE = ["pending", "confirmed", "scheduled", "in_progress"] as const;

/** PostgREST `.in()` on `listings.seller_id` can fail when column is uuid and pool is text — `or(eq…)` is reliable. */
async function listingIdsOwnedBySellerPool(
  supabase: ReturnType<typeof createAdminSupabase>,
  poolVariants: string[]
): Promise<string[]> {
  if (poolVariants.length === 0) return [];
  const orFilter = poolVariants.map((id) => `seller_id.eq.${id}`).join(",");
  const { data: lr, error } = await supabase.from("listings").select("id").or(orFilter);
  if (error) {
    const { data: lr2 } = await supabase.from("listings").select("id").in("seller_id", poolVariants);
    return [...new Set((lr2 ?? []).map((r) => String(r.id)))];
  }
  return [...new Set((lr ?? []).map((r) => String(r.id)))];
}
function uuidPoolForIn(ids: string[]): string[] {
  return [...new Set(ids.flatMap((id) => idMatchVariantsForIn(id)))];
}

/** Same overlap rule as listing-stitched buyer rows (JWT pool vs booking.buyer_id account pool). */
async function buyerCanSeePaidBookingRow(
  supabase: ReturnType<typeof createAdminSupabase>,
  buyerPoolVariants: string[],
  row: BookingRow
): Promise<boolean> {
  const rowBuyerPool = await expandUserAccountIdPool(supabase, String(row.buyer_id ?? ""));
  return poolsOverlap(rowBuyerPool, buyerPoolVariants);
}

/** Paid bookings must sort by settlement time — row `created_at` is checkout start and can be much older than `paid_at`. */
const PAID_BOOKING_LIST_LIMIT = 100;

function cmpRecentBookingActivity(a: BookingRow, b: BookingRow): number {
  const pa = a.paid_at ? new Date(String(a.paid_at)).getTime() : 0;
  const pb = b.paid_at ? new Date(String(b.paid_at)).getTime() : 0;
  if (pb !== pa) return pb - pa;
  return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
}

/** Paid seller list: show in-progress / scheduled / confirmed before completed so the one still open is on top. */
function cmpSellerPaidBookingsList(a: BookingRow, b: BookingRow): number {
  const pri = (s: string): number => {
    switch (s) {
      case "in_progress":
        return 0;
      case "scheduled":
        return 1;
      case "confirmed":
      case "pending":
        return 2;
      case "completed":
        return 3;
      case "cancelled":
        return 4;
      default:
        return 2;
    }
  };
  const pa = pri(String(a.status ?? ""));
  const pb = pri(String(b.status ?? ""));
  if (pa !== pb) return pa - pb;
  return cmpRecentBookingActivity(a, b);
}

function sortSellerMergedRows(rows: BookingRow[], statusFilter: string | null): BookingRow[] {
  return [...rows].sort((a, b) =>
    statusFilter === "paid"
      ? cmpSellerPaidBookingsList(a, b)
      : new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  );
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
  let sellerStats:
    | {
        sellerCompletedPaid: number;
        sellerPaidBookings: number;
        sellerActivePaidBookings: number;
      }
    | undefined;

  if (sellerMode) {
    const pool = await expandUserAccountIdPool(supabase, userId);
    const poolVariants = uuidPoolForIn(pool);

    const { data: strikeRow } = await supabase
      .from("users")
      .select("provider_strike_count")
      .in("id", poolVariants)
      .limit(1)
      .maybeSingle();
    sellerStrikeCount = strikeRow?.provider_strike_count ?? 0;

    const listingIds = await listingIdsOwnedBySellerPool(supabase, poolVariants);
    const listingIdVariantsForBookings = [...new Set(listingIds.flatMap((id) => idMatchVariantsForIn(id)))];
    sellerStats = await getSellerAccountBookingCounts(supabase, poolVariants, listingIdVariantsForBookings);

    let qBySeller = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("seller_id", poolVariants);
    if (statusFilter === "paid") {
      qBySeller = qBySeller
        .eq("payment_status", "paid")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      qBySeller = qBySeller.order("created_at", { ascending: false });
    }
    qBySeller = qBySeller.limit(SELLER_PAID_FETCH_CAP);
    const { data: bySellerId, error: err1 } = await qBySeller;
    if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

    let byListing: NonNullable<typeof bySellerId> = [];
    if (listingIdVariantsForBookings.length > 0) {
      let qByList = supabase
        .from("service_bookings")
        .select(SERVICE_BOOKING_LIST_COLUMNS)
        .in("listing_id", listingIdVariantsForBookings);
      if (statusFilter === "paid") {
        qByList = qByList
          .eq("payment_status", "paid")
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
      } else {
        qByList = qByList.order("created_at", { ascending: false });
      }
      qByList = qByList.limit(SELLER_PAID_FETCH_CAP);
      const { data: bl, error: err2 } = await qByList;
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });
      byListing = bl ?? [];
    }

    const merged = new Map<string, BookingRow>();
    for (const row of [...(bySellerId ?? []), ...byListing]) {
      const key = canonicalBookingRowIdKey(row.id);
      const prev = merged.get(key);
      if (!prev) merged.set(key, row as BookingRow);
      else merged.set(key, mergeBookingListRowsPreferTruth(prev, row as BookingRow) as BookingRow);
    }

    if (statusFilter === "paid") {
      const hasSeller = poolVariants.length > 0;
      const hasList = listingIdVariantsForBookings.length > 0;
      if (hasSeller || hasList) {
        let qActive = supabase
          .from("service_bookings")
          .select(SERVICE_BOOKING_LIST_COLUMNS)
          .eq("payment_status", "paid")
          .in("status", [...SELLER_ACTIVE_LIFECYCLE]);
        if (hasSeller && hasList) {
          qActive = qActive.or(
            `seller_id.in.(${poolVariants.join(",")}),listing_id.in.(${listingIdVariantsForBookings.join(",")})`,
          );
        } else if (hasSeller) {
          qActive = qActive.in("seller_id", poolVariants);
        } else {
          qActive = qActive.in("listing_id", listingIdVariantsForBookings);
        }
        qActive = qActive
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(SELLER_ACTIVE_PAID_FETCH_CAP);
        const { data: activePaidRows, error: errActive } = await qActive;
        if (errActive) return NextResponse.json({ error: errActive.message }, { status: 500 });
        for (const row of activePaidRows ?? []) {
          const key = canonicalBookingRowIdKey(row.id);
          const prev = merged.get(key);
          if (!prev) merged.set(key, row as BookingRow);
          else merged.set(key, mergeBookingListRowsPreferTruth(prev, row as BookingRow) as BookingRow);
        }
      }
    }

    bookingRows = sortSellerMergedRows([...merged.values()], statusFilter);
    if (bookingRows.length > SELLER_PAID_RESPONSE_CAP) {
      bookingRows = bookingRows.slice(0, SELLER_PAID_RESPONSE_CAP);
    }

    /** If seller_id drifted vs listing.owner or UUID casing mismatched joins, WhatsApp still fires — stitch row by NG-ticket lookup */
    const ticketNorm = normalizeNgTicketQuery(req.nextUrl.searchParams.get("ticket"));
    if (ticketNorm) {
      let qTk = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).ilike("ticket_code", ticketNorm);
      if (statusFilter === "paid") qTk = qTk.eq("payment_status", "paid");
      const { data: byTicketRow } = await qTk.maybeSingle();
      const tr = byTicketRow as BookingRow | null;
      if (tr?.id != null && (await sellerCanManagePaidBookingRow(supabase, poolVariants, tr))) {
        const key = canonicalBookingRowIdKey(tr.id);
        const prevMap = merged.get(key);
        if (!prevMap) merged.set(key, tr);
        else merged.set(key, mergeBookingListRowsPreferTruth(prevMap as BookingRow, tr) as BookingRow);
        bookingRows = sortSellerMergedRows([...merged.values()], statusFilter);
        if (bookingRows.length > SELLER_PAID_RESPONSE_CAP) {
          bookingRows = bookingRows.slice(0, SELLER_PAID_RESPONSE_CAP);
        }
      }
    }
  } else {
    const buyerPool = await expandUserAccountIdPool(supabase, userId);
    const buyerVariants = uuidPoolForIn(buyerPool);

    let query = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("buyer_id", buyerVariants);
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
    for (const row of byBuyerId ?? []) mergedBuy.set(canonicalBookingRowIdKey(row.id), row as BookingRow);

    const { data: convs } = await supabase
      .from("listing_conversations")
      .select("listing_id")
      .in("buyer_id", buyerVariants)
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
        const key = canonicalBookingRowIdKey(row.id);
        const rowBuyerPool = await poolForBookingBuyer(String(row.buyer_id));
        if (!poolsOverlap(rowBuyerPool, buyerVariants)) continue;
        const prev = mergedBuy.get(key);
        if (!prev) mergedBuy.set(key, row as BookingRow);
        else mergedBuy.set(key, mergeBookingListRowsPreferTruth(prev, row as BookingRow) as BookingRow);
      }
    }

    /** WhatsApp / payment can succeed while `buyer_id` on the row predates account merge — stitch by NG-ticket (mirrors seller). */
    const ticketNormBuyer = normalizeNgTicketQuery(req.nextUrl.searchParams.get("ticket"));
    if (ticketNormBuyer) {
      let qTk = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).ilike("ticket_code", ticketNormBuyer);
      if (statusFilter === "paid") qTk = qTk.eq("payment_status", "paid");
      const { data: byTicketRow } = await qTk.maybeSingle();
      const tr = byTicketRow as BookingRow | null;
      if (tr?.id != null && (await buyerCanSeePaidBookingRow(supabase, buyerVariants, tr))) {
        const key = canonicalBookingRowIdKey(tr.id);
        const prevMap = mergedBuy.get(key);
        if (!prevMap) mergedBuy.set(key, tr);
        else mergedBuy.set(key, mergeBookingListRowsPreferTruth(prevMap as BookingRow, tr) as BookingRow);
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

  bookingRows = await applyServiceBookingStatusTruthPass(supabase, bookingRows);

  const reviewedSet = await loadReviewedBookingIdSet(supabase, bookingRows);
  const enriched = await enrichBookingListRows(supabase, bookingRows, sellerMode, reviewedSet);

  return NextResponse.json(
    {
      bookings: enriched,
      ...(sellerMode && sellerStrikeCount !== undefined ? { sellerStrikeCount } : {}),
      ...(sellerMode && sellerStats ? { sellerStats } : {}),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
