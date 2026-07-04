import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { buildDispatchDebugReport } from "@/lib/rides/dispatch-debug";
import {
  createRideRequest,
} from "@/lib/rides/ride-bookings-server";
import { isLocalColoniaKey, normalizeWaitTimeHours, type RideTripType } from "@/lib/rides/ride-destinations";
import {
  isValidRidePlaceKey,
  locationFromRidePlaceKey,
  ridePlaceLabel,
} from "@/lib/rides/ride-locations";
import {
  notifyBuyerRideCreated,
  notifyDriverRideMatched,
} from "@/lib/rides/ride-notify";
import type { RideLocation } from "@/lib/rides/ride-pricing";

type RequestBody = {
  pickup_colonia?: string;
  dropoff_colonia?: string;
  pickup_address?: string;
  dropoff_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
  passengers?: number;
  luggage?: string;
  language?: string;
  auto_match?: boolean;
  buyer_id?: string;
  trip_type?: RideTripType;
  destination_stops?: string[];
  wait_time_hours?: number;
};

function resolveLocation(
  placeKey: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  address: string | undefined
): RideLocation | null {
  if (placeKey) {
    return locationFromRidePlaceKey(placeKey, address);
  }
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      address: address?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    };
  }
  return null;
}

/**
 * POST /api/rides/request
 * Create a ride booking. Buyer must be logged in (or internal secret + buyer_id).
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const internal = verifyInternalSecret(req);
  let buyerId: string | null = null;
  let supabase = createAdminSupabase();

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    if (internal) {
      if (body.buyer_id) {
        buyerId = String(body.buyer_id).trim().toLowerCase();
      }
    } else {
      const guard = await ridesRouteGuard(req);
      if (!guard.ok) return guard.response;
      buyerId = guard.userId.trim().toLowerCase();
      supabase = guard.supabase;
    }

    if (!buyerId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const pickupColonia = body.pickup_colonia?.trim();
    const tripType = body.trip_type === "quick_individual" ? "quick_individual" : "standard";
    const waitTimeHours = normalizeWaitTimeHours(body.wait_time_hours);
    const quickStopKeys =
      tripType === "quick_individual"
        ? (body.destination_stops ?? [])
            .map((key) => key.trim())
            .filter((key) => key.length > 0)
            .slice(0, 8)
        : [];
    const dropoffColonia =
      tripType === "quick_individual"
        ? quickStopKeys[quickStopKeys.length - 1]
        : body.dropoff_colonia?.trim();

    if (pickupColonia && !isValidRidePlaceKey(pickupColonia)) {
      return NextResponse.json({ error: "Origen inválido" }, { status: 400 });
    }

    if (tripType === "quick_individual") {
      if (quickStopKeys.length === 0) {
        return NextResponse.json(
          { error: "Indica al menos un destino para viajes individuales rápidos" },
          { status: 400 },
        );
      }
      if (!quickStopKeys.every(isLocalColoniaKey)) {
        return NextResponse.json(
          { error: "Los viajes individuales rápidos solo usan colonias locales" },
          { status: 400 },
        );
      }
    } else if (dropoffColonia && !isValidRidePlaceKey(dropoffColonia)) {
      return NextResponse.json({ error: "Destino inválido" }, { status: 400 });
    }

    if (
      tripType === "standard" &&
      pickupColonia &&
      dropoffColonia &&
      pickupColonia === dropoffColonia
    ) {
      return NextResponse.json({ error: "Origen y destino deben ser diferentes" }, { status: 400 });
    }

    const pickup = resolveLocation(
      pickupColonia,
      body.pickup_lat,
      body.pickup_lng,
      body.pickup_address
    );

    let dropoff: RideLocation | null = null;
    let stopLocations: RideLocation[] | undefined;
    if (tripType === "quick_individual") {
      stopLocations = quickStopKeys
        .map((key) => locationFromRidePlaceKey(key))
        .filter((loc): loc is RideLocation => loc !== null);
      dropoff = stopLocations[stopLocations.length - 1] ?? null;
    } else {
      dropoff = resolveLocation(
        dropoffColonia,
        body.dropoff_lat,
        body.dropoff_lng,
        body.dropoff_address
      );
    }

    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: "Indica colonias de origen y destino" },
        { status: 400 }
      );
    }

    const dropoffAddress =
      tripType === "quick_individual"
        ? quickStopKeys.map((key) => ridePlaceLabel(key, "es")).join(" → ")
        : body.dropoff_address;

    const result = await createRideRequest(supabase, {
      buyerId,
      pickup,
      dropoff: {
        ...dropoff,
        address: dropoffAddress?.trim() || dropoff.address,
      },
      pickupColoniaKey: pickupColonia ?? null,
      dropoffColoniaKey: dropoffColonia ?? null,
      tripType,
      destinationStopKeys: tripType === "quick_individual" ? quickStopKeys : undefined,
      stopLocations,
      waitTimeHours,
      passengers: body.passengers,
      luggage: body.luggage ?? null,
      language: body.language ?? "es",
      source: internal ? "internal" : "web",
      autoMatch: body.auto_match !== false,
    });

    if (!result.ok) {
      const status =
        result.code === "insufficient_balance"
          ? 402
          : result.code === "no_drivers"
            ? 404
            : 400;
      const body: Record<string, unknown> = { error: result.error, code: result.code };
      if (result.code === "no_drivers" && pickupColonia) {
        body.dispatch_debug = await buildDispatchDebugReport(supabase, {
          pickupColoniaKey: pickupColonia,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
        });
      }
      return NextResponse.json(body, { status });
    }

    await notifyBuyerRideCreated(supabase, {
      ride: result.ride,
      matched: result.matched,
    });

    if (result.matched && result.ride.driver_id) {
      await notifyDriverRideMatched(supabase, {
        ride: result.ride,
        driverUserId: result.ride.driver_id,
      });
    }

    return NextResponse.json({
      ride: result.ride,
      estimate: result.estimate,
      matched: result.matched,
    });
  } catch (e) {
    console.error("[rides/request] POST", e);
    return NextResponse.json({ error: "No se pudo solicitar el viaje" }, { status: 500 });
  }
}
