import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { COLONIAS } from "@/lib/colonias";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { buildDispatchDebugReport } from "@/lib/rides/dispatch-debug";
import {
  createRideRequest,
} from "@/lib/rides/ride-bookings-server";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";
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
};

function resolveLocation(
  coloniaKey: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  address: string | undefined
): RideLocation | null {
  if (coloniaKey) {
    return locationFromColoniaKey(coloniaKey, address);
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
    const dropoffColonia = body.dropoff_colonia?.trim();

    if (pickupColonia && !COLONIAS[pickupColonia]) {
      return NextResponse.json({ error: "Colonia de origen inválida" }, { status: 400 });
    }
    if (dropoffColonia && !COLONIAS[dropoffColonia]) {
      return NextResponse.json({ error: "Colonia de destino inválida" }, { status: 400 });
    }
    if (pickupColonia && dropoffColonia && pickupColonia === dropoffColonia) {
      return NextResponse.json({ error: "Origen y destino deben ser diferentes" }, { status: 400 });
    }

    const pickup = resolveLocation(
      pickupColonia,
      body.pickup_lat,
      body.pickup_lng,
      body.pickup_address
    );
    const dropoff = resolveLocation(
      dropoffColonia,
      body.dropoff_lat,
      body.dropoff_lng,
      body.dropoff_address
    );

    if (!pickup || !dropoff) {
      return NextResponse.json(
        { error: "Indica colonias de origen y destino" },
        { status: 400 }
      );
    }

    const result = await createRideRequest(supabase, {
      buyerId,
      pickup,
      dropoff,
      pickupColoniaKey: pickupColonia ?? null,
      dropoffColoniaKey: dropoffColonia ?? null,
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
