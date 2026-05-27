import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { driverProfileUserIdVariants } from "@/lib/user-id-variants";
import { findAnyDriverProfileForAccount } from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";

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
  const profile = await resolveDriverProfileForSession(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
  });
  if (!profile?.user_id || !profile.is_active_driver) {
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

  const profileIds = driverProfileUserIdVariants(String(profile.user_id));

  const { data: updated, error } = await guard.supabase
    .from("driver_profiles")
    .update(patch)
    .in("user_id", profileIds)
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at")
    .limit(1)
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

  if (Boolean(updated.is_online) !== online) {
    console.error("[rides/drivers/me/online] POST state mismatch", {
      wanted: online,
      got: updated.is_online,
      user_id: updated.user_id,
    });
    return NextResponse.json(
      {
        error: "No se guardó el estado en línea. Ejecuta rides-restore-driver-profile.sql e intenta de nuevo.",
        code: "state_mismatch",
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

  const driver = await resolveDriverProfileForSession(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
  });
  return NextResponse.json({ driver });
}
