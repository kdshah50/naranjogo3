import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalBookingRowIdKey } from "@/lib/booking-list-merge";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

type TruthRow = { id: unknown; status: unknown; updated_at: unknown };

const TRUTH_ID_CHUNK = 20;
const SINGLE_TRUTH_CONCURRENCY = 8;

/**
 * Re-read `status` + `updated_at` from `service_bookings` so merged list branches and caps
 * never show an older lifecycle (e.g. confirmed / "scheduling pending" after completed).
 */
export async function applyServiceBookingStatusTruthPass<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  bookingRows: T[],
): Promise<T[]> {
  if (bookingRows.length === 0) return bookingRows;

  const canonicalIds = [...new Set(bookingRows.map((b) => canonicalBookingRowIdKey(b.id)))].filter(Boolean);
  const truthByKey = new Map<string, TruthRow>();

  for (let i = 0; i < canonicalIds.length; i += TRUTH_ID_CHUNK) {
    const slice = canonicalIds.slice(i, i + TRUTH_ID_CHUNK);
    const chunkVars = [...new Set(slice.flatMap((cid) => idMatchVariantsForIn(cid)))];
    if (chunkVars.length === 0) continue;

    const { data: truthRows, error: truthErr } = await supabase
      .from("service_bookings")
      .select("id,status,updated_at")
      .in("id", chunkVars);

    if (truthErr) {
      console.error("[booking-status-truth] chunk failed", truthErr.message, {
        chunkStart: i,
        canonicalCount: slice.length,
        variantCount: chunkVars.length,
      });
      continue;
    }

    for (const r of truthRows ?? []) {
      truthByKey.set(canonicalBookingRowIdKey(r.id), r);
    }
  }

  const truthKeysLoaded = new Set(truthByKey.keys());
  const missingForTruth = canonicalIds.filter((kid) => !truthKeysLoaded.has(kid));
  for (let i = 0; i < missingForTruth.length; i += SINGLE_TRUTH_CONCURRENCY) {
    const slice = missingForTruth.slice(i, i + SINGLE_TRUTH_CONCURRENCY);
    await Promise.all(
      slice.map(async (kid) => {
        const vars = idMatchVariantsForIn(kid);
        if (vars.length === 0) return;
        const { data: rows, error: oneErr } = await supabase
          .from("service_bookings")
          .select("id,status,updated_at")
          .in("id", vars)
          .limit(1);
        if (oneErr) {
          console.error("[booking-status-truth] single-id fallback failed", oneErr.message, kid);
          return;
        }
        const row = rows?.[0];
        if (row) truthByKey.set(canonicalBookingRowIdKey(row.id), row);
      }),
    );
  }

  return bookingRows.map((b) => {
    const t = truthByKey.get(canonicalBookingRowIdKey(b.id));
    if (!t) return b;
    return { ...b, status: t.status, updated_at: t.updated_at };
  });
}

/** Truth pass for a single paid row (listing service-booking block). */
export async function truthPassSinglePaidBookingRow<T extends { id: string; status?: unknown; updated_at?: unknown }>(
  supabase: SupabaseClient,
  row: T | null,
): Promise<T | null> {
  if (!row?.id) return row;
  const [fixed] = await applyServiceBookingStatusTruthPass(supabase, [row as T & Record<string, unknown>]);
  return fixed ?? row;
}
