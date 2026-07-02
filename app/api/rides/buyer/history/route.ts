import { NextRequest, NextResponse } from "next/server";
import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";
import { listBuyerRideHistory } from "@/lib/rides/ride-trip-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/buyer/history?ticket=NG-…
 * Recent taxi/ride bookings for the logged-in buyer (for /my-bookings merge).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketHints: string[] = [];
  for (const raw of req.nextUrl.searchParams.getAll("ticket")) {
    const n = normalizeNgTicketQuery(raw);
    if (n) ticketHints.push(n);
  }
  const ticketHint = ticketHints[0] ?? "";

  try {
    const rides = await listBuyerRideHistory(guard.supabase, guard.userId, {
      authPhone: guard.authPhone,
      limit: 15,
      ticketHint: ticketHint || null,
    });

    return NextResponse.json(
      { rides },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    console.error("[rides/buyer/history] GET", e);
    return NextResponse.json({ error: "History failed", code: "history_failed" }, { status: 500 });
  }
}
