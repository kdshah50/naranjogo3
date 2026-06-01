import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseWalletHoldForRide } from "@/lib/rides/wallet-hold";

const ACTIVE_STATUSES = ["requested", "matched", "accepted", "arrived", "in_trip"] as const;

export type StaleRideCleanupResult = {
  cancelled_ride_ids: string[];
  released_holds: number;
};

/**
 * Cancel ride_bookings stuck in active status for longer than maxAgeHours.
 * Releases wallet holds. Safe for preview/staging cron (Phase 0).
 */
export async function cancelStaleActiveRides(
  supabase: SupabaseClient,
  args?: { maxAgeHours?: number; cancelReason?: string },
): Promise<StaleRideCleanupResult> {
  const maxAgeHours = Math.max(1, args?.maxAgeHours ?? 24);
  const cancelReason = args?.cancelReason ?? "stale_auto_cleanup";
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from("ride_bookings")
    .select("id, buyer_id, hold_amount_mxn_cents, status, updated_at")
    .in("status", [...ACTIVE_STATUSES])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[stale-ride-cleanup] query", error);
    return { cancelled_ride_ids: [], released_holds: 0 };
  }

  const cancelledIds: string[] = [];
  let releasedHolds = 0;

  for (const row of stale ?? []) {
    const rideId = String(row.id);
    const { data: updated, error: upErr } = await supabase
      .from("ride_bookings")
      .update({
        status: "cancelled",
        cancel_reason: cancelReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rideId)
      .in("status", [...ACTIVE_STATUSES])
      .select("id")
      .maybeSingle();

    if (upErr || !updated) continue;
    cancelledIds.push(rideId);

    const buyerId = String(row.buyer_id).trim().toLowerCase();
    const holdAmount = Math.round(Number(row.hold_amount_mxn_cents ?? 0));
    if (holdAmount > 0) {
      const rel = await releaseWalletHoldForRide(supabase, {
        userId: buyerId,
        rideBookingId: rideId,
        releaseAmountMxnCents: holdAmount,
        meta: { reason: cancelReason },
      });
      if (rel.ok) releasedHolds++;
    }
  }

  return { cancelled_ride_ids: cancelledIds, released_holds: releasedHolds };
}
