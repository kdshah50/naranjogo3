import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard, tripErrorResponse } from "@/lib/rides/ride-route-guard";
import { disputeRide } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const result = await disputeRide(guard.supabase, {
    rideId: id,
    buyerUserId: guard.userId,
    reason: body.reason,
  });
  if (!result.ok) return tripErrorResponse(result);
  return NextResponse.json({ ride: result.ride });
}
