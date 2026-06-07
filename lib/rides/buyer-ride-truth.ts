import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { getRideById, getRideByIdFresh, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { resolveCanonicalRideByTicketForBuyer } from "@/lib/rides/resolve-ride-by-ticket";
import { withStatusCode } from "@/lib/rides/ride-transition-pipeline";
import type { RideDriverPublic } from "@/lib/rides/ride-sync-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

const DRIVER_PUBLIC_STATUSES = new Set([
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
]);

async function loadDriverPublic(
  supabase: SupabaseClient,
  driverUserId: string,
): Promise<RideDriverPublic | null> {
  const id = String(driverUserId ?? "").trim();
  if (!id) return null;

  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase
      .from("driver_profiles")
      .select(
        "vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_plates,last_lat,last_lng,last_location_at",
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase.from("users").select("display_name").eq("id", id).maybeSingle(),
  ]);

  if (!profile && !user?.display_name) return null;

  return {
    display_name: user?.display_name ?? null,
    vehicle_make: profile?.vehicle_make ?? null,
    vehicle_model: profile?.vehicle_model ?? null,
    vehicle_year: profile?.vehicle_year ?? null,
    vehicle_color: profile?.vehicle_color ?? null,
    vehicle_plates: profile?.vehicle_plates ?? null,
    last_lat: profile?.last_lat ?? null,
    last_lng: profile?.last_lng ?? null,
    last_location_at: profile?.last_location_at ?? null,
  };
}

export type BuyerRideTruthState = {
  ride: RideBookingRow & { status_code: number };
  driver_public: RideDriverPublic | null;
  status_source: "ride_events";
};

/**
 * Single authoritative read for rider /viaje — lifecycle status comes from
 * append-only ride_events, not lagging ride_bookings replica reads.
 */
export async function getBuyerRideTruthState(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    rideId?: string | null;
    ticketCode?: string | null;
  },
): Promise<BuyerRideTruthState | null> {
  const accountOpts = { authPhone: args.authPhone };
  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts);

  let base: RideBookingRow | null = null;
  const ticket = String(args.ticketCode ?? "").trim();
  const rideId = String(args.rideId ?? "").trim();

  if (ticket) {
    base = await resolveCanonicalRideByTicketForBuyer(
      supabase,
      args.sessionUserId,
      ticket,
      accountOpts,
    );
  } else if (rideId) {
    const row = await getRideById(supabase, rideId);
    if (row && pool.some((uid) => isSameUserId(uid, row.buyer_id))) {
      base = row;
    }
  }

  if (!base?.id) return null;

  const fresh =
    (await getRideByIdFresh(supabase, base.id, { attempts: 5, delayMs: 200 })) ?? base;
  const ride = withStatusCode(fresh) as RideBookingRow & {
    status_code: number;
  };

  let driverPublic: RideDriverPublic | null = null;
  if (ride.driver_id && DRIVER_PUBLIC_STATUSES.has(ride.status)) {
    driverPublic = await loadDriverPublic(supabase, ride.driver_id);
  }

  return {
    ride,
    driver_public: driverPublic,
    status_source: "ride_events",
  };
}
