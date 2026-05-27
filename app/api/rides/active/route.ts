import { NextRequest, NextResponse } from "next/server";
import { isSameUserId } from "@/lib/auth-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { getRideById } from "@/lib/rides/ride-bookings-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import {
  latestBuyerRideForDisplay,
  listActiveTripsForBuyer,
  listActiveTripsForDriver,
} from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

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
  const [buyerTrips, buyerDisplay, driverTrips] = await Promise.all([
    listActiveTripsForBuyer(guard.supabase, guard.userId, accountOpts),
    latestBuyerRideForDisplay(guard.supabase, guard.userId, accountOpts),
    asDriver ? listActiveTripsForDriver(guard.supabase, guard.userId, accountOpts) : Promise.resolve([]),
  ]);

  const primaryBuyerActive = buyerTrips[0] ?? null;

  let reconciledRide = null;
  const reconcileRideId = req.nextUrl.searchParams.get("reconcile_ride_id")?.trim();
  if (reconcileRideId) {
    const ride = await getRideById(guard.supabase, reconcileRideId);
    if (ride && pool.some((uid) => isSameUserId(uid, ride.buyer_id))) {
      reconciledRide = ride;
    }
  }

  return NextResponse.json({
    as_buyer: buyerTrips,
    as_buyer_active: primaryBuyerActive,
    as_buyer_display: buyerDisplay,
    as_buyer_has_open: buyerTrips.length > 0,
    as_driver: driverTrips,
    reconciled_ride: reconciledRide,
  });
}
