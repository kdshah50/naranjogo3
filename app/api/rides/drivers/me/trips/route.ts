import { NextRequest, NextResponse } from "next/server";
import { findActiveDriverProfileForAccount } from "@/lib/rides/driver-account";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { listActiveTripsForDriver } from "@/lib/rides/ride-trip-server";

export const dynamic = "force-dynamic";

/** GET /api/rides/drivers/me/trips — active assignments for logged-in driver. */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const accountOpts = { authPhone: guard.authPhone };
  const profile = await findActiveDriverProfileForAccount(
    guard.supabase,
    guard.userId,
    accountOpts,
  );
  const trips = profile
    ? await listActiveTripsForDriver(guard.supabase, guard.userId, accountOpts)
    : [];

  const body: Record<string, unknown> = { trips, driver_user_id: profile?.user_id ?? null };
  if (req.nextUrl.searchParams.get("debug") === "1") {
    body.session_user_id = guard.userId;
    body.auth_phone_set = Boolean(guard.authPhone);
  }

  return NextResponse.json(body);
}
