import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Behavior + reviews + users.provider_rank_multiplier (bypass soft penalty).
 * Falls back to 1 if RPC missing or errors.
 */
export async function fetchListingRankMultipliers(
  supabase: SupabaseClient,
  listingIds: string[],
): Promise<Record<string, number>> {
  const uniq = [...new Set(listingIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniq.length === 0) return {};

  const { data, error } = await supabase.rpc("get_listing_rank_multipliers", {
    p_listing_ids: uniq,
  });

  if (error) {
    console.error("[listing-rank] get_listing_rank_multipliers", error);
    return Object.fromEntries(uniq.map((id) => [id, 1]));
  }

  const raw = data as Record<string, unknown> | null;
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === "number" ? v : Number(v);
      out[k] = Number.isFinite(n) && n > 0 ? n : 1;
    }
  }
  for (const id of uniq) {
    if (out[id] == null) out[id] = 1;
  }
  return out;
}
