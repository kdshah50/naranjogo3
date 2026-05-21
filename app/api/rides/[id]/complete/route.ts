import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard, tripErrorResponse } from "@/lib/rides/ride-route-guard";
import { completeTrip } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { final_total_mxn_cents?: number };
  const finalCents =
    body.final_total_mxn_cents != null
      ? Math.round(Number(body.final_total_mxn_cents))
      : undefined;

  const result = await completeTrip(guard.supabase, {
    rideId: id,
    driverUserId: guard.userId,
    finalTotalMxnCents: finalCents,
  });
  if (!result.ok) return tripErrorResponse(result);
  return NextResponse.json({ ride: result.ride });
}
