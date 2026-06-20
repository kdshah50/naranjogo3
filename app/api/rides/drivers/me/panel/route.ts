import { NextRequest, NextResponse } from "next/server";
import { loadDriverPanel } from "@/lib/rides/driver-panel-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/drivers/me/panel
 * Driver online status + assigned trips in one response (canonical profile user_id).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const rideId = req.nextUrl.searchParams.get("ride_id")?.trim() || null;
  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() || null;

  try {
    const panel = await loadDriverPanel(guard.supabase, {
      sessionUserId: guard.userId,
      authPhone: guard.authPhone,
      explicitRideId: rideId,
      explicitTicketCode: ticketCode,
    });

    return NextResponse.json(panel, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    console.error("[rides/drivers/me/panel] GET", e);
    return NextResponse.json(
      { error: "No se pudo cargar el panel de conductor", code: "panel_failed" },
      { status: 500 },
    );
  }
}
