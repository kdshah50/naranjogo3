import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { buildDriverTripsDebugReport } from "@/lib/rides/driver-trips-debug";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides-drivers-trips-debug
 * Logged-in driver session — why /conductor/viajes shows no trips.
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const report = await buildDriverTripsDebugReport(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
  });

  return NextResponse.json(report);
}
