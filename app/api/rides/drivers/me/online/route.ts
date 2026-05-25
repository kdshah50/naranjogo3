import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import {
  findActiveDriverProfileForAccount,
  findAnyDriverProfileForAccount,
} from "@/lib/rides/driver-account";

export const dynamic = "force-dynamic";

/**
 * POST /api/rides/drivers/me/online
 * Toggle online + optional GPS ping.
 */
export async function POST(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as {
    online?: boolean;
    lat?: number;
    lng?: number;
  };

  const authOpts = { authPhone: guard.authPhone };
  const profile = await findActiveDriverProfileForAccount(
    guard.supabase,
    guard.userId,
    authOpts,
  );
  if (!profile?.user_id) {
    const any = await findAnyDriverProfileForAccount(guard.supabase, guard.userId, authOpts);
    if (any && !any.is_active_driver) {
      return NextResponse.json(
        { error: "Tu conductor aún no está aprobado por admin.", code: "not_approved" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error:
          "No encontramos un conductor activo para esta sesión. Cierra sesión en /unete e inicia con el mismo WhatsApp del registro (415 181 6902).",
        code: "not_active_driver",
      },
      { status: 403 },
    );
  }

  const online = body.online !== false;
  const patch: Record<string, unknown> = {
    is_online: online,
    updated_at: new Date().toISOString(),
  };

  if (
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng)
  ) {
    patch.last_lat = body.lat;
    patch.last_lng = body.lng;
    patch.last_location_at = new Date().toISOString();
  }

  const { data: updated, error } = await guard.supabase
    .from("driver_profiles")
    .update(patch)
    .eq("user_id", profile.user_id)
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[rides/drivers/me/online] POST", error);
    const missingColumn =
      error?.message?.includes("is_online") ||
      error?.message?.includes("last_lat") ||
      error?.code === "42703";
    return NextResponse.json(
      {
        error: missingColumn
          ? "Falta migración Phase 4 en Supabase (columnas is_online / GPS en driver_profiles)."
          : "No se pudo actualizar estado",
        code: missingColumn ? "schema_missing" : "update_failed",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ driver: updated });
}

/** GET — current online status. */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const authOpts = { authPhone: guard.authPhone };
  const active = await findActiveDriverProfileForAccount(
    guard.supabase,
    guard.userId,
    authOpts,
  );
  if (active) {
    return NextResponse.json({ driver: active });
  }

  const any = await findAnyDriverProfileForAccount(guard.supabase, guard.userId, authOpts);
  return NextResponse.json({ driver: any });
}
