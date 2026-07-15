import { NextRequest, NextResponse } from "next/server";
import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";
import { toClientRideHistoryRow } from "@/lib/rides/ride-address-pii";
import { listDriverRideHistory } from "@/lib/rides/ride-trip-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/drivers/me/history?ticket=NG-…
 * Recent taxi trips for the logged-in driver (/conductor/viajes).
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
  const langParam = req.nextUrl.searchParams.get("lang")?.trim().toLowerCase();
  const lang = langParam === "en" ? "en" : "es";

  try {
    const rows = await listDriverRideHistory(guard.supabase, guard.userId, {
      authPhone: guard.authPhone,
      limit: 15,
      ticketHint: ticketHint || null,
    });
    const rides = rows.map((row) => toClientRideHistoryRow(row, lang));

    return NextResponse.json(
      { rides },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    console.error("[rides/drivers/me/history] GET", e);
    return NextResponse.json({ error: "History failed", code: "history_failed" }, { status: 500 });
  }
}
