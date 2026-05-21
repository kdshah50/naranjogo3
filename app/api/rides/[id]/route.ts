import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, isSameUserId } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { verifyInternalSecret } from "@/lib/rides/internal-auth";
import { getRideById } from "@/lib/rides/ride-bookings-server";
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
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await ctx.params;
  const rideId = String(id ?? "").trim();
  if (!rideId) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  try {
    const supabase = createAdminSupabase();
    const ride = await getRideById(supabase, rideId);
    if (!ride) {
      return NextResponse.json({ error: "Viaje no encontrado" }, { status: 404 });
    }

    if (verifyInternalSecret(req)) {
      return NextResponse.json({ ride });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const pool = await expandUserAccountIdPool(supabase, userId);
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
