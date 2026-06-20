import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { COLONIAS } from "@/lib/colonias";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { estimateFare, type RideLocation } from "@/lib/rides/ride-pricing";

type EstimateBody = {
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  dropoff_address?: string;
  pickup_colonia?: string;
  dropoff_colonia?: string;
};

function locationFromBody(
  prefix: "pickup" | "dropoff",
  body: EstimateBody
): RideLocation | null {
  const coloniaKey =
    prefix === "pickup" ? body.pickup_colonia : body.dropoff_colonia;
  const lat = prefix === "pickup" ? body.pickup_lat : body.dropoff_lat;
  const lng = prefix === "pickup" ? body.pickup_lng : body.dropoff_lng;
  const address =
    prefix === "pickup" ? body.pickup_address : body.dropoff_address;

  if (coloniaKey && COLONIAS[coloniaKey]) {
    const c = COLONIAS[coloniaKey];
    return {
      lat: c.lat,
      lng: c.lng,
      address: address?.trim() || c.label,
    };
  }

  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return {
      lat,
      lng,
      address: address?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    };
  }

  return null;
}

/**
 * POST /api/rides/pricing/estimate
 * Deterministic fare estimate. Callable by logged-in buyer or internal secret (ride-ai).
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const internal = verifyInternalSecret(req);
  if (!internal) {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
  }

  try {
    const body = (await req.json().catch(() => ({}))) as EstimateBody;
    const pickup = locationFromBody("pickup", body);
    const dropoff = locationFromBody("dropoff", body);

    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: "Indica origen y destino (colonia o lat/lng)" },
        { status: 400 }
      );
    }

    const estimate = estimateFare(pickup, dropoff);
    return NextResponse.json({ estimate, pickup, dropoff });
  } catch (e) {
    console.error("[rides/pricing/estimate] POST", e);
    return NextResponse.json({ error: "No se pudo calcular la tarifa" }, { status: 500 });
  }
}
