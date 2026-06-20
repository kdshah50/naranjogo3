import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { hydrateRideRowFromEvents } from "@/lib/rides/ride-event-truth";
import { resolveCanonicalRideByTicketForDriver } from "@/lib/rides/resolve-ride-by-ticket";
import { withStatusCode } from "@/lib/rides/ride-transition-pipeline";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

const DRIVER_ACTIVE = new Set(["matched", "accepted", "arrived", "in_trip"]);

export type DriverRideTruthState = {
  ride: RideBookingRow & { status_code: number };
  trips: Array<RideBookingRow & { status_code: number }>;
  status_source: "ride_events";
};

/**
 * Authoritative driver trip read — status from ride_events (same source as WhatsApp).
 */
export async function getDriverRideTruthState(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    rideId?: string | null;
    ticketCode?: string | null;
  },
): Promise<DriverRideTruthState | null> {
  const accountOpts = { authPhone: args.authPhone };
  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts);

  let base: RideBookingRow | null = null;
  const ticket = String(args.ticketCode ?? "").trim();
  const rideId = String(args.rideId ?? "").trim();

  if (ticket) {
    base = await resolveCanonicalRideByTicketForDriver(
      supabase,
      args.sessionUserId,
      ticket,
      accountOpts,
    );
  } else if (rideId) {
    const row = await getRideById(supabase, rideId);
    if (row && row.driver_id && pool.some((uid) => isSameUserId(uid, row.driver_id))) {
      base = row;
    }
  }

  if (!base?.id) return null;

  const ride = withStatusCode(await hydrateRideRowFromEvents(supabase, base)) as RideBookingRow & {
    status_code: number;
  };

  if (!DRIVER_ACTIVE.has(ride.status)) {
    if (ride.status === "completed" || ride.status === "cancelled") {
      return { ride, trips: [ride], status_source: "ride_events" };
    }
    return null;
  }

  return {
    ride,
    trips: [ride],
    status_source: "ride_events",
  };
}
