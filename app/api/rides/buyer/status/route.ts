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
 * GET /api/rides/buyer/status?ticket_code=NG-…&ride_id=…
 * Authoritative rider panel state — status from ride_events only.
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  const rideId = req.nextUrl.searchParams.get("ride_id")?.trim() ?? "";
  if (!ticketCode && !rideId) {
    return NextResponse.json(
      { error: "ticket_code or ride_id required", code: "missing_ref" },
      { status: 400 },
    );
  }

  try {
    const state = await getBuyerRideTruthState(guard.supabase, {
      sessionUserId: guard.userId,
      authPhone: guard.authPhone,
      rideId: rideId || null,
      ticketCode: ticketCode || null,
    });

    if (!state?.ride?.id) {
      return NextResponse.json({
        ride: null,
        driver_public: null,
        status_source: "ride_events",
        reason: "not_found",
      });
    }

    if (!BUYER_VISIBLE.has(state.ride.status)) {
      return NextResponse.json({
        ride: null,
        driver_public: null,
        status_source: "ride_events",
        reason: `status_${state.ride.status}`,
      });
    }

    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    console.error("[rides/buyer/status] GET", e);
    return NextResponse.json({ error: "Status failed", code: "status_failed" }, { status: 500 });
  }
}
