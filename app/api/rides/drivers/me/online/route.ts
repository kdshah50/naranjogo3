import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/**
 * POST /api/rides/drivers/me/online
 * Toggle online + optional GPS ping.
 */
export async function POST(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as {
    online?: boolean;
    lat?: number;
    lng?: number;
  };

  const idPool = await expandUserAccountIdPool(guard.supabase, guard.userId);
  const { data: profile } = await guard.supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver")
    .in("user_id", idPool)
    .eq("is_active_driver", true)
    .limit(1)
    .maybeSingle();

  if (!profile?.user_id) {
    return NextResponse.json({ error: "No eres conductor activo" }, { status: 403 });
  }

  const online = body.online !== false;
  const patch: Record<string, unknown> = {
    is_online: online,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.lat === "number" && typeof body.lng === "number" && Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
    patch.last_lat = body.lat;
    patch.last_lng = body.lng;
    patch.last_location_at = new Date().toISOString();
  }

  const { data: updated, error } = await guard.supabase
    .from("driver_profiles")
    .update(patch)
    .eq("user_id", profile.user_id)
    .select("user_id,is_online,last_lat,last_lng,last_location_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[rides/drivers/me/online] POST", error);
    return NextResponse.json({ error: "No se pudo actualizar estado" }, { status: 500 });
  }

  return NextResponse.json({ driver: updated });
}

/** GET — current online status. */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const idPool = await expandUserAccountIdPool(guard.supabase, guard.userId);
  const { data: profile } = await guard.supabase
    .from("driver_profiles")
    .select("user_id,is_online,last_lat,last_lng,last_location_at,is_active_driver")
    .in("user_id", idPool)
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ driver: null });
  }

  return NextResponse.json({ driver: profile });
}
