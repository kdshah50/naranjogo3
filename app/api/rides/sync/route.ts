import { NextRequest, NextResponse } from "next/server";
import { loadRideSyncState } from "@/lib/rides/ride-sync-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/sync?ride_id=
 * Single source of truth for rider + driver panels (Uber-style sync).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const rideId = req.nextUrl.searchParams.get("ride_id")?.trim() || null;
  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() || null;

  const state = await loadRideSyncState(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
    rideId,
    ticketCode,
  });

  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
