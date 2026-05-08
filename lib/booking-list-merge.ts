/** Merge two copies of the same booking id when combining query results (e.g. seller_id vs listing_id lists). */

export type BookingListMergeRow = Record<string, unknown>;

function updatedAtMs(row: BookingListMergeRow): number {
  const v = row.updated_at;
  if (v == null || v === "") return 0;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Further along typical service flow (tie-break if updated_at missing / equal). */
function lifecycleRank(status: string): number {
  switch (status) {
    case "cancelled":
      return 100;
    case "completed":
      return 50;
    case "in_progress":
      return 40;
    case "scheduled":
      return 30;
    case "confirmed":
      return 20;
    case "pending":
      return 10;
    default:
      return 0;
  }
}

/**
 * Prefer the snapshot that matches the latest write / most advanced lifecycle so a stale row
 * cannot overwrite e.g. `completed` with `confirmed` when merging seller bookings.
 */
export function mergeBookingListRowsPreferTruth(a: BookingListMergeRow, b: BookingListMergeRow): BookingListMergeRow {
  const ta = updatedAtMs(a);
  const tb = updatedAtMs(b);
  if (ta !== tb) return ta >= tb ? a : b;
  const ra = lifecycleRank(String(a.status ?? ""));
  const rb = lifecycleRank(String(b.status ?? ""));
  if (ra !== rb) return ra >= rb ? a : b;
  return a;
}
