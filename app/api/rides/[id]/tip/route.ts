import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard, tripErrorResponse } from "@/lib/rides/ride-route-guard";
import { addTipToRide } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    tip_mxn_cents?: number;
    tip_mxn?: number;
  };
  const tipCents =
    body.tip_mxn_cents != null
      ? Math.round(Number(body.tip_mxn_cents))
      : body.tip_mxn != null
        ? Math.round(Number(body.tip_mxn) * 100)
        : 0;

  const result = await addTipToRide(guard.supabase, {
    rideId: id,
    buyerUserId: guard.userId,
    tipMxnCents: tipCents,
  });
  if (!result.ok) return tripErrorResponse(result);
  return NextResponse.json({ ride: result.ride });
}
