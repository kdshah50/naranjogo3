import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { dropActiveRowsWithCompletedTicket } from "@/lib/rides/ride-ghost-filter";
import {
  latestBuyerRideForDisplay,
  listActiveTripsForBuyer,
  listActiveTripsForDriver,
} from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

const BUYER_OPEN_STATUSES = new Set(["requested", "matched", "accepted", "arrived", "in_trip"]);

async function verifyBuyerActiveTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
      if (!fresh || !BUYER_OPEN_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

/** GET /api/rides/active — current user's in-progress rides (buyer or driver). */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const accountOpts = { authPhone: guard.authPhone };
  const pool = await expandUserAccountIdPool(guard.supabase, guard.userId, accountOpts);

  const { data: profile } = await guard.supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver")
    .in("user_id", pool)
    .eq("is_active_driver", true)
    .limit(1)
    .maybeSingle();

  const asDriver = Boolean(profile?.user_id);
  const [buyerTripsRaw, buyerDisplayRaw, driverTrips] = await Promise.all([
    listActiveTripsForBuyer(guard.supabase, guard.userId, accountOpts),
    latestBuyerRideForDisplay(guard.supabase, guard.userId, accountOpts),
    asDriver ? listActiveTripsForDriver(guard.supabase, guard.userId, accountOpts) : Promise.resolve([]),
  ]);

  const { trips: buyerActiveTripsRaw } = await dropActiveRowsWithCompletedTicket(
    guard.supabase,
    buyerTripsRaw,
  );
  const buyerActiveTrips = await verifyBuyerActiveTrips(guard.supabase, buyerActiveTripsRaw);
  const primaryBuyerActive = buyerActiveTrips[0] ?? null;

  let buyerDisplay = buyerDisplayRaw;
  if (
    buyerDisplayRaw &&
    BUYER_OPEN_STATUSES.has(buyerDisplayRaw.status)
  ) {
    const { trips: filtered } = await dropActiveRowsWithCompletedTicket(guard.supabase, [
      buyerDisplayRaw,
    ]);
    if (filtered.length === 0) buyerDisplay = null;
  }

  let reconciledRide = null;
  const reconcileRideId = req.nextUrl.searchParams.get("reconcile_ride_id")?.trim();
  if (reconcileRideId) {
    const ride = await getRideById(guard.supabase, reconcileRideId);
    if (ride && pool.some((uid) => isSameUserId(uid, ride.buyer_id))) {
      reconciledRide = ride;
    }
  }

  return NextResponse.json(
    {
      as_buyer: buyerActiveTrips,
      as_buyer_active: primaryBuyerActive,
      as_buyer_display: buyerDisplay,
      as_buyer_has_open: buyerActiveTrips.length > 0,
      as_driver: driverTrips,
      reconciled_ride: reconciledRide,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
