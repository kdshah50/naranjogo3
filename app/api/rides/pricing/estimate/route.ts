import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { isLocalColoniaKey, type RideTripType } from "@/lib/rides/ride-destinations";
import { locationFromRidePlaceKey } from "@/lib/rides/ride-locations";
import { resolveRideFareEstimate, type RideLocation } from "@/lib/rides/ride-pricing";

type EstimateBody = {
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  dropoff_address?: string;
  pickup_colonia?: string;
  dropoff_colonia?: string;
  trip_type?: RideTripType;
  destination_stops?: string[];
};

function locationFromBody(
  prefix: "pickup" | "dropoff",
  body: EstimateBody
): RideLocation | null {
  const placeKey =
    prefix === "pickup" ? body.pickup_colonia : body.dropoff_colonia;
  const lat = prefix === "pickup" ? body.pickup_lat : body.dropoff_lat;
  const lng = prefix === "pickup" ? body.pickup_lng : body.dropoff_lng;
  const address =
    prefix === "pickup" ? body.pickup_address : body.dropoff_address;

  if (placeKey) {
    const fromKey = locationFromRidePlaceKey(placeKey, address);
    if (fromKey) return fromKey;
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

function normalizeQuickStops(raw: string[] | undefined): string[] {
  const stops = (raw ?? [])
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  return stops.slice(0, 8);
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
    const tripType = body.trip_type === "quick_individual" ? "quick_individual" : "standard";
    const pickup = locationFromBody("pickup", body);

    if (!pickup) {
      return NextResponse.json(
        { error: "Indica origen (colonia o lat/lng)" },
        { status: 400 }
      );
    }

    if (tripType === "quick_individual") {
      const stopKeys = normalizeQuickStops(body.destination_stops);
      if (stopKeys.length === 0) {
        return NextResponse.json(
          { error: "Indica al menos un destino para viajes individuales rápidos" },
          { status: 400 }
        );
      }
      if (!stopKeys.every(isLocalColoniaKey)) {
        return NextResponse.json(
          { error: "Los viajes individuales rápidos solo usan colonias locales" },
          { status: 400 }
        );
      }
      const stopLocations = stopKeys
        .map((key) => locationFromRidePlaceKey(key))
        .filter((loc): loc is RideLocation => loc !== null);
      const dropoff = stopLocations[stopLocations.length - 1];
      if (!dropoff) {
        return NextResponse.json({ error: "Destino inválido" }, { status: 400 });
      }
      const estimate = resolveRideFareEstimate({
        tripType,
        pickup,
        dropoff,
        stopLocations,
      });
      return NextResponse.json({ estimate, pickup, dropoff, destination_stops: stopKeys });
    }

    const dropoff = locationFromBody("dropoff", body);
    if (!dropoff) {
      return NextResponse.json(
        { error: "Indica destino (colonia o lat/lng)" },
        { status: 400 }
      );
    }

    const estimate = resolveRideFareEstimate({
      tripType,
      pickup,
      dropoff,
      dropoffKey: body.dropoff_colonia,
    });
    return NextResponse.json({ estimate, pickup, dropoff });
  } catch (e) {
    console.error("[rides/pricing/estimate] POST", e);
    return NextResponse.json({ error: "No se pudo calcular la tarifa" }, { status: 500 });
  }
}
