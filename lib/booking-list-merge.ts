/** Merge two copies of the same booking id when combining query results (e.g. seller_id vs listing_id lists). */

export type BookingListMergeRow = Record<string, unknown>;

function updatedAtMs(row: BookingListMergeRow): number {
  const v = row.updated_at;
  if (v == null || v === "") return 0;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Collapse UUID `id` variants so the same booking never appears twice in merged maps (stale branch + fresh branch). */
export function canonicalBookingRowIdKey(id: unknown): string {
  return String(id ?? "").trim().toLowerCase();
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
 * Prefer the **most advanced** `status` first (completed beats confirmed even if another snapshot
 * has a newer `updated_at`), then tie-break with `updated_at`. Avoids seller/buyer merged lists
 * showing "scheduling pending" after a completed booking when two branches return inconsistent rows.
 */
export function mergeBookingListRowsPreferTruth(a: BookingListMergeRow, b: BookingListMergeRow): BookingListMergeRow {
  const ra = lifecycleRank(String(a.status ?? ""));
  const rb = lifecycleRank(String(b.status ?? ""));
  if (ra !== rb) return ra >= rb ? a : b;
  const ta = updatedAtMs(a);
  const tb = updatedAtMs(b);
  if (ta !== tb) return ta >= tb ? a : b;
  return a;
}
