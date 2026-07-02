import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalBookingRowIdKey, mergeBookingListRowsPreferTruth } from "@/lib/booking-list-merge";
import { SERVICE_BOOKING_LIST_COLUMNS } from "@/lib/booking-list-select";
import { chunkArray, POSTGREST_IN_VALUE_CHUNK } from "@/lib/postgrest-in-chunks";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

type BookingRow = Record<string, unknown>;

/** Append-only log — fresher than recency-capped service_bookings list scans on read replicas. */
const RECENT_PAYMENT_EVENT_DAYS = 14;
const RECENT_PAYMENT_EVENTS_CAP = 100;

async function recentPaymentConfirmedBookingIds(supabase: SupabaseClient): Promise<string[]> {
  const since = new Date(Date.now() - RECENT_PAYMENT_EVENT_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("booking_events")
    .select("booking_id")
    .eq("event_type", "payment_confirmed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(RECENT_PAYMENT_EVENTS_CAP);
  if (error) {
    console.error("[booking-payment-event-stitch] booking_events", error.message);
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const id = String(row.booking_id ?? "").trim();
    if (!id) continue;
    const key = canonicalBookingRowIdKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

async function loadPaidBookingRowsByIds(
  supabase: SupabaseClient,
  bookingIds: string[],
  statusFilter: string | null,
): Promise<BookingRow[]> {
  const idVariants = [...new Set(bookingIds.flatMap((id) => idMatchVariantsForIn(id)))];
  const out: BookingRow[] = [];
  for (const part of chunkArray(idVariants, POSTGREST_IN_VALUE_CHUNK)) {
    if (part.length === 0) continue;
    let q = supabase.from("service_bookings").select(SERVICE_BOOKING_LIST_COLUMNS).in("id", part);
    if (statusFilter === "paid") q = q.eq("payment_status", "paid");
    const { data, error } = await q;
    if (error) {
      console.error("[booking-payment-event-stitch] service_bookings.in", error.message);
      continue;
    }
    out.push(...((data ?? []) as BookingRow[]));
  }
  return out;
}

/**
 * Merge paid rows from recent `payment_confirmed` events when seller list queries miss
 * brand-new bookings (read-replica lag). Same pattern as ticket stitch, without ?ticket=.
 */
export async function stitchPaidBookingsFromRecentPaymentEvents(
  supabase: SupabaseClient,
  merged: Map<string, BookingRow>,
  canIncludeRow: (row: BookingRow) => Promise<boolean>,
  statusFilter: string | null,
): Promise<void> {
  const bookingIds = await recentPaymentConfirmedBookingIds(supabase);
  if (bookingIds.length === 0) return;

  const rows = await loadPaidBookingRowsByIds(supabase, bookingIds, statusFilter);
  for (const row of rows) {
    if (row.id == null || !(await canIncludeRow(row))) continue;
    const key = canonicalBookingRowIdKey(row.id);
    const prev = merged.get(key);
    if (!prev) merged.set(key, row);
    else merged.set(key, mergeBookingListRowsPreferTruth(prev, row) as BookingRow);
  }
}

/** Banner stats: never under-count vs rows actually returned after stitch passes. */
export function sellerStatsAtLeastAsLargeAsList(
  serverStats: {
    sellerCompletedPaid: number;
    sellerPaidBookings: number;
    sellerActivePaidBookings: number;
  },
  bookingRows: BookingRow[],
): {
  sellerCompletedPaid: number;
  sellerPaidBookings: number;
  sellerActivePaidBookings: number;
} {
  const paid = bookingRows.filter((b) => String(b.payment_status ?? "") === "paid");
  const completed = paid.filter((b) => String(b.status ?? "").toLowerCase() === "completed").length;
  const cancelled = paid.filter((b) => String(b.status ?? "").toLowerCase() === "cancelled").length;
  const active = Math.max(0, paid.length - completed - cancelled);
  return {
    sellerPaidBookings: Math.max(serverStats.sellerPaidBookings, paid.length),
    sellerCompletedPaid: Math.max(serverStats.sellerCompletedPaid, completed),
    sellerActivePaidBookings: Math.max(serverStats.sellerActivePaidBookings, active),
  };
}
