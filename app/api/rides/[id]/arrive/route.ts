import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard, tripErrorResponse } from "@/lib/rides/ride-route-guard";
import { arriveAtPickup } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const result = await arriveAtPickup(guard.supabase, { rideId: id, driverUserId: guard.userId });
  if (!result.ok) return tripErrorResponse(result);
  return NextResponse.json({ ride: result.ride });
}
