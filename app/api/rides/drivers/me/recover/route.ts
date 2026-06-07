import { NextRequest, NextResponse } from "next/server";
import { getDriverRideTruthState } from "@/lib/rides/driver-ride-truth";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/drivers/me/recover?ticket_code=NG-…&ride_id=…
 * Event-log truth for driver panel (same source as WhatsApp).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  const rideIdParam = req.nextUrl.searchParams.get("ride_id")?.trim() ?? "";
  if (!ticketCode && !rideIdParam) {
    return NextResponse.json(
      { error: "ticket_code or ride_id required", code: "missing_ref" },
      { status: 400 },
    );
  }

  try {
    const state = await getDriverRideTruthState(guard.supabase, {
      sessionUserId: guard.userId,
      authPhone: guard.authPhone,
      rideId: rideIdParam || null,
      ticketCode: ticketCode || null,
    });

    if (!state?.ride?.id) {
      return NextResponse.json({
        ride: null,
        trips: [],
        ticket_code: ticketCode || null,
        reason: "not_found",
      });
    }

    return NextResponse.json({
      ride: state.ride,
      trips: state.trips,
      ticket_code: ticketCode || state.ride.ticket_code,
      status_source: state.status_source,
    });
  } catch (e) {
    console.error("[rides/drivers/me/recover] GET", e);
    return NextResponse.json({ error: "Recover failed", code: "recover_failed" }, { status: 500 });
  }
}
