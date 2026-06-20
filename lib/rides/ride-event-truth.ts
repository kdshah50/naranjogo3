import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEventTruthToRide,
  type RideBookingRow,
} from "@/lib/rides/ride-bookings-server";

/** Lifecycle status from ride_events — never trust ride_bookings.status alone. */
export async function hydrateRideRowFromEvents(
  supabase: SupabaseClient,
  row: RideBookingRow,
): Promise<RideBookingRow> {
  return applyEventTruthToRide(supabase, row);
}
