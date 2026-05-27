import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
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

  const { data: profile } = await guard.supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver")
    .in("user_id", await expandUserAccountIdPool(guard.supabase, guard.userId))
    .eq("is_active_driver", true)
    .limit(1)
    .maybeSingle();

  const asDriver = Boolean(profile?.user_id);
  const accountOpts = { authPhone: guard.authPhone };
  const [buyerTrips, buyerDisplay, driverTrips] = await Promise.all([
    listActiveTripsForBuyer(guard.supabase, guard.userId, accountOpts),
    latestBuyerRideForDisplay(guard.supabase, guard.userId, accountOpts),
    asDriver ? listActiveTripsForDriver(guard.supabase, guard.userId, accountOpts) : Promise.resolve([]),
  ]);

  const primaryBuyerActive = buyerTrips[0] ?? null;

  return NextResponse.json({
    as_buyer: buyerTrips,
    as_buyer_active: primaryBuyerActive,
    as_buyer_display: buyerDisplay,
    as_driver: driverTrips,
  });
}
