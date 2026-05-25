import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { listActiveTripsForDriver } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

/** GET /api/rides/drivers/me/trips — active assignments for logged-in driver. */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const trips = await listActiveTripsForDriver(guard.supabase, guard.userId, {
    authPhone: guard.authPhone,
  });
  return NextResponse.json({ trips });
}
