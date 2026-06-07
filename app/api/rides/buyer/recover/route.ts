import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { getRideByIdFresh } from "@/lib/rides/ride-bookings-server";
import { resolveCanonicalRideByTicketForBuyer } from "@/lib/rides/resolve-ride-by-ticket";
import { withStatusCode } from "@/lib/rides/ride-transition-pipeline";

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
 * Fast ticket lookup for rider /viaje recovery (event-hydrated, no slow list scans).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  if (!ticketCode) {
    return NextResponse.json({ error: "ticket_code required", code: "missing_ticket" }, { status: 400 });
  }

  try {
    const ride = await resolveCanonicalRideByTicketForBuyer(
      guard.supabase,
      guard.userId,
      ticketCode,
      { authPhone: guard.authPhone },
    );

    const resolved =
      ride?.id != null
        ? (await getRideByIdFresh(guard.supabase, ride.id, { attempts: 2, delayMs: 150 })) ?? ride
        : null;

    if (!resolved?.id) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode,
        reason: "not_found",
      });
    }

    if (!BUYER_VISIBLE.has(resolved.status)) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode,
        reason: `status_${resolved.status}`,
      });
    }

    const payload = withStatusCode(resolved) as RideBookingRow & { status_code: number };
    return NextResponse.json({
      ride: payload,
      ticket_code: ticketCode,
    });
  } catch (e) {
    console.error("[rides/buyer/recover] GET", e);
    return NextResponse.json({ error: "Recover failed", code: "recover_failed" }, { status: 500 });
  }
}
