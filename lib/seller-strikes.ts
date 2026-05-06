import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When ops approves or marks refunded a guarantee claim for provider no-show, record one strike (idempotent per claim).
 */
export async function recordGuaranteeNoShowStrikeIfNeeded(
  supabase: SupabaseClient,
  opts: {
    claimId: string;
    bookingId: string;
    sellerId: string;
    adminStatus: string;
    claimReason: string;
  }
): Promise<{ recorded: boolean }> {
  const terminal = opts.adminStatus === "approved" || opts.adminStatus === "refunded";
  if (!terminal || opts.claimReason !== "no_show") {
    return { recorded: false };
  }

  const { data: dup } = await supabase
    .from("seller_strike_events")
    .select("id")
    .eq("source_claim_id", opts.claimId)
    .maybeSingle();

  if (dup) return { recorded: false };

  const { data: inserted, error } = await supabase
    .from("seller_strike_events")
    .insert({
      seller_id: opts.sellerId,
      booking_id: opts.bookingId,
      strike_type: "guarantee_no_show_approved",
      source_claim_id: opts.claimId,
      meta: { via: "guarantee_claim_admin", status: opts.adminStatus },
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    console.error("[seller-strikes] insert failed", error);
    return { recorded: false };
  }

  const { data: row } = await supabase
    .from("users")
    .select("provider_strike_count")
    .eq("id", opts.sellerId)
    .maybeSingle();

  const next = (row?.provider_strike_count ?? 0) + 1;
  const { error: upErr } = await supabase
    .from("users")
    .update({ provider_strike_count: next })
    .eq("id", opts.sellerId);

  if (upErr) console.error("[seller-strikes] increment provider_strike_count failed", upErr);

  return { recorded: true };
}
