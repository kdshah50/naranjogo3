import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard, tripErrorResponse } from "@/lib/rides/ride-route-guard";
import { startTrip } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { ticket_code?: string };
  const ticketCode = String(body.ticket_code ?? "").trim();
  if (!ticketCode) {
    return NextResponse.json({ error: "ticket_code requerido" }, { status: 400 });
  }

  const result = await startTrip(guard.supabase, {
    rideId: id,
    driverUserId: guard.userId,
    ticketCode,
  });
  if (!result.ok) return tripErrorResponse(result);
  return NextResponse.json({ ride: result.ride });
}
