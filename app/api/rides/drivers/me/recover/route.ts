import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { resolveCanonicalRideByTicketForDriver } from "@/lib/rides/resolve-ride-by-ticket";

export const dynamic = "force-dynamic";

const DRIVER_ACTIVE = new Set(["matched", "accepted", "arrived", "in_trip"]);

/**
 * GET /api/rides/drivers/me/recover?ticket_code=NG-XXXXXXXX
 * Fast ticket lookup for driver panel recovery (no slow list/event fallbacks).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  if (!ticketCode) {
    return NextResponse.json({ error: "ticket_code required", code: "missing_ticket" }, { status: 400 });
  }

  try {
    const ride = await resolveCanonicalRideByTicketForDriver(
      guard.supabase,
      guard.userId,
      ticketCode,
      { authPhone: guard.authPhone },
    );

    if (!ride?.id || !DRIVER_ACTIVE.has(ride.status)) {
      return NextResponse.json({
        ride: null,
        trips: [],
        ticket_code: ticketCode,
        reason: ride ? `status_${ride.status}` : "not_found",
      });
    }

    return NextResponse.json({
      ride,
      trips: [ride],
      ticket_code: ticketCode,
    });
  } catch (e) {
    console.error("[rides/drivers/me/recover] GET", e);
    return NextResponse.json({ error: "Recover failed", code: "recover_failed" }, { status: 500 });
  }
}
