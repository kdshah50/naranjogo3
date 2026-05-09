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

/** DB / JSON may vary in casing; unknown values must not outrank known lifecycles. */
export function normalizeLifecycleStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

/** Further along typical service flow (tie-break if updated_at missing / equal). */
function lifecycleRankNormalized(norm: string): number {
  switch (norm) {
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
  const na = normalizeLifecycleStatus(a.status);
  const nb = normalizeLifecycleStatus(b.status);
  const ra = lifecycleRankNormalized(na);
  const rb = lifecycleRankNormalized(nb);
  if (ra !== rb) return ra >= rb ? a : b;
  const ta = updatedAtMs(a);
  const tb = updatedAtMs(b);
  if (ta !== tb) return ta >= tb ? a : b;
  return a;
}

/**
 * When applying `/api/bookings` results to React state, keep the more advanced `status` already on
 * screen if the payload is stale (parallel polls or a slow fetch finishing after an optimistic PATCH).
 * Same rank → prefer newer `updated_at` so a slower-but-fresher response beats a fast stale one.
 */
export function mergeBookingListAvoidStatusRegression<T extends { id: string; status?: string | null }>(
  prev: T[],
  server: T[],
): T[] {
  const prevByKey = new Map(prev.map((row) => [canonicalBookingRowIdKey(row.id), row]));
  return server.map((s) => {
    const o = prevByKey.get(canonicalBookingRowIdKey(s.id));
    if (!o) return s;
    const ns = normalizeLifecycleStatus(s.status);
    const no = normalizeLifecycleStatus(o.status);
    const rs = lifecycleRankNormalized(ns);
    const ro = lifecycleRankNormalized(no);
    if (ro > rs) return { ...s, status: o.status };
    if (rs > ro) return s;
    const ts = updatedAtMs(s as BookingListMergeRow);
    const to = updatedAtMs(o as BookingListMergeRow);
    if (ts > to) return s;
    if (to > ts) return { ...s, status: o.status };
    return s;
  });
}
