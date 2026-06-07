import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEventTruthToRide,
  getRideLifecycleStatusFromEvents,
  type RideBookingRow,
} from "@/lib/rides/ride-bookings-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";

/** Lifecycle status from ride_events — never trust ride_bookings.status alone. */
export async function hydrateRideRowFromEvents(
  supabase: SupabaseClient,
  row: RideBookingRow,
): Promise<RideBookingRow> {
  const fromEvents = await getRideLifecycleStatusFromEvents(supabase, row.id);
  if (fromEvents && rideStatusRank(fromEvents) >= rideStatusRank(row.status)) {
    if (fromEvents === "completed" || fromEvents === "cancelled") {
      return applyEventTruthToRide(supabase, { ...row, status: fromEvents });
    }
    return { ...row, status: fromEvents };
  }
  return applyEventTruthToRide(supabase, row);
}
