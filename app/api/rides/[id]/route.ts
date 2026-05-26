import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, isSameUserId } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { getRideById } from "@/lib/rides/ride-bookings-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/[id]
 * Ride status for buyer, assigned driver, or internal tools.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const rideId = String(id ?? "").trim();
  if (!rideId) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }
  // Static ride tools live outside /api/rides/[id] (e.g. /api/rides-dispatch-debug).
  if (rideId === "debug-dispatch") {
    return NextResponse.json(
      { error: "Usa GET /api/rides-dispatch-debug?pickup_colonia=centro" },
      { status: 404 },
    );
  }

  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (verifyInternalSecret(req)) {
      const supabase = createAdminSupabase();
      const ride = await getRideById(supabase, rideId);
      if (!ride) {
        return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ ride });
    }

    const guard = await ridesRouteGuard(req);
    if (!guard.ok) return guard.response;

    const ride = await getRideById(guard.supabase, rideId);
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

    return NextResponse.json({ ride });
  } catch (e) {
    console.error("[rides/[id]] GET", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
