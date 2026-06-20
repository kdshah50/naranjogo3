import { NextRequest, NextResponse } from "next/server";
import { getBuyerRideTruthState } from "@/lib/rides/buyer-ride-truth";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

const BUYER_VISIBLE = new Set([
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
  "cancelled",
]);

/**
 * GET /api/rides/buyer/recover?ticket_code=NG-XXXXXXXX
 * GET /api/rides/buyer/recover?ride_id=uuid
 * Alias of buyer/status — event-log is source of truth.
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  const rideIdParam = req.nextUrl.searchParams.get("ride_id")?.trim() ?? "";
  if (!ticketCode && !rideIdParam) {
    return NextResponse.json(
      { error: "ticket_code or ride_id required", code: "missing_ticket" },
      { status: 400 },
    );
  }

  try {
    const state = await getBuyerRideTruthState(guard.supabase, {
      sessionUserId: guard.userId,
      authPhone: guard.authPhone,
      rideId: rideIdParam || null,
      ticketCode: ticketCode || null,
    });

    if (!state?.ride?.id) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode || null,
        reason: "not_found",
      });
    }

    if (!BUYER_VISIBLE.has(state.ride.status)) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode || null,
        reason: `status_${state.ride.status}`,
      });
    }

    return NextResponse.json({
      ride: state.ride,
      driver_public: state.driver_public,
      ticket_code: ticketCode || state.ride.ticket_code,
      status_source: state.status_source,
    });
  } catch (e) {
    console.error("[rides/buyer/recover] GET", e);
    return NextResponse.json({ error: "Recover failed", code: "recover_failed" }, { status: 500 });
  }
}
