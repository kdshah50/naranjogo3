import { NextRequest, NextResponse } from "next/server";
import { clientIpFromHeaders } from "@/lib/rate-limit-memory";
import { rateLimitDriverLocation } from "@/lib/rate-limit";
import {
  parseDriverCoords,
  updateDriverLocation,
} from "@/lib/rides/driver-location-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/rides/drivers/me/location
 * GPS ping only — does not toggle online status (see /drivers/me/online).
 */
export async function POST(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ip = clientIpFromHeaders(req.headers);
  const rl = await rateLimitDriverLocation(`${guard.userId}:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas actualizaciones de ubicación.", code: "rate_limited" },
      {
        status: 429,
        headers: rl.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) }
          : undefined,
      },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    ride_id?: string;
  };

  const coords = parseDriverCoords(body.lat, body.lng);
  if (!coords) {
    return NextResponse.json(
      { error: "lat/lng inválidos.", code: "invalid_coords" },
      { status: 400 },
    );
  }

  const result = await updateDriverLocation(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
    lat: coords.lat,
    lng: coords.lng,
    rideId: body.ride_id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, driver: result.driver });
}
