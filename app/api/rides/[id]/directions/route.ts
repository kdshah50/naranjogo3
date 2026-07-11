import { NextRequest, NextResponse } from "next/server";
import { isSameUserId } from "@/lib/auth-server";
import { getRideByIdFresh } from "@/lib/rides/ride-bookings-server";
import { fetchRideDirections } from "@/lib/rides/mapbox-directions";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/[id]/directions
 * ETA + route geometry from driver (or pickup) to the active target.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await ctx.params;
  const trimmed = String(rideId ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ride = await getRideByIdFresh(guard.supabase, trimmed, { attempts: 2, delayMs: 200 });
  if (!ride) {
    return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
  }

  const pool = await expandUserAccountIdPool(guard.supabase, guard.userId, {
    authPhone: guard.authPhone,
  });
  const allowed =
    pool.some((uid) => isSameUserId(uid, ride.buyer_id)) ||
    (ride.driver_id && pool.some((uid) => isSameUserId(uid, ride.driver_id)));

  if (!allowed) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const driverLat = Number(req.nextUrl.searchParams.get("driver_lat"));
  const driverLng = Number(req.nextUrl.searchParams.get("driver_lng"));
  const hasDriver =
    Number.isFinite(driverLat) &&
    Number.isFinite(driverLng) &&
    driverLat >= -90 &&
    driverLat <= 90 &&
    driverLng >= -180 &&
    driverLng <= 180;

  let toLat = ride.pickup_lat;
  let toLng = ride.pickup_lng;
  let target: "pickup" | "dropoff" = "pickup";

  if (ride.status === "in_trip") {
    toLat = ride.dropoff_lat;
    toLng = ride.dropoff_lng;
    target = "dropoff";
  }

  let fromLat = hasDriver ? driverLat : ride.pickup_lat;
  let fromLng = hasDriver ? driverLng : ride.pickup_lng;

  if (!hasDriver && ride.status === "in_trip") {
    fromLat = ride.pickup_lat;
    fromLng = ride.pickup_lng;
  }

  const directions = await fetchRideDirections({
    fromLat,
    fromLng,
    toLat,
    toLng,
  });

  return NextResponse.json(
    {
      target,
      ...directions,
      from: { lat: fromLat, lng: fromLng },
      to: { lat: toLat, lng: toLng },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
