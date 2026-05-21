import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { getRideById, matchRideToDriver } from "@/lib/rides/ride-bookings-server";
import {
  notifyBuyerRideCreated,
  notifyDriverRideMatched,
} from "@/lib/rides/ride-notify";

/**
 * POST /api/rides/[id]/match
 * Internal: assign nearest available driver to a requested ride.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const rideId = String(id ?? "").trim();
  if (!rideId) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      pickup_colonia?: string;
      driver_user_id?: string;
    };

    const supabase = createAdminSupabase();
    const existing = await getRideById(supabase, rideId);
    if (!existing) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    const match = await matchRideToDriver(supabase, {
      rideId,
      pickupColoniaKey: body.pickup_colonia ?? null,
      driverUserId: body.driver_user_id ?? null,
    });

    if (!match.ok) {
      const status = match.code === "no_drivers" ? 404 : 400;
      return NextResponse.json({ error: match.error, code: match.code }, { status });
    }

    await notifyBuyerRideCreated(supabase, { ride: match.ride, matched: true });
    await notifyDriverRideMatched(supabase, {
      ride: match.ride,
      driverUserId: match.driverUserId,
    });

    return NextResponse.json({ ride: match.ride, driver_user_id: match.driverUserId });
  } catch (e) {
    console.error("[rides/[id]/match] POST", e);
    return NextResponse.json({ error: "No se pudo asignar conductor" }, { status: 500 });
  }
}
