import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { COLONIAS } from "@/lib/colonias";
import { findNearbyDrivers } from "@/lib/rides/dispatch";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";

type NearbyBody = {
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_colonia?: string;
  limit?: number;
};

/**
 * POST /api/rides/drivers/nearby
 * Dispatch matrix stub — colonia-centroid distance ranking (Mapbox deferred).
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as NearbyBody;
    let lat = body.pickup_lat;
    let lng = body.pickup_lng;
    const coloniaKey = body.pickup_colonia?.trim();

    if (coloniaKey && COLONIAS[coloniaKey]) {
      lat = COLONIAS[coloniaKey].lat;
      lng = COLONIAS[coloniaKey].lng;
    }

    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "pickup_lat/lng o pickup_colonia requerido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const drivers = await findNearbyDrivers(supabase, {
      pickupLat: lat,
      pickupLng: lng,
      pickupColoniaKey: coloniaKey ?? null,
      limit: body.limit ?? 5,
    });

    return NextResponse.json({ drivers, count: drivers.length });
  } catch (e) {
    console.error("[rides/drivers/nearby] POST", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
