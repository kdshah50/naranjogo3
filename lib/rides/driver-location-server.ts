import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  driverOnlineUpdateIdPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import { isSameUserId } from "@/lib/auth-server";

export type DriverLocationPatch = {
  last_lat: number;
  last_lng: number;
  last_location_at: string;
};

export function isValidDriverCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function parseDriverCoords(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  if (!isValidDriverCoords(lat, lng)) return null;
  return { lat, lng: lng as number };
}

/** Persist driver GPS ping on all duplicate profile rows for this account. */
export async function updateDriverLocation(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    lat: number;
    lng: number;
    rideId?: string | null;
  },
): Promise<
  | { ok: true; driver: DriverProfileOnlineRow }
  | { ok: false; code: string; error: string; status: number }
> {
  const authOpts = { authPhone: args.authPhone };
  const profile = await resolveDriverProfileForSession(supabase, {
    sessionUserId: args.sessionUserId,
    authPhone: args.authPhone,
  });

  if (!profile?.user_id || !profile.is_active_driver) {
    return {
      ok: false,
      code: "not_active_driver",
      error: "Conductor no activo para esta sesión.",
      status: 403,
    };
  }

  const rideId = String(args.rideId ?? "").trim();
  if (rideId) {
    const { data: ride, error: rideErr } = await supabase
      .from("ride_bookings")
      .select("id,driver_id,status")
      .eq("id", rideId)
      .maybeSingle();
    if (rideErr || !ride?.id) {
      return { ok: false, code: "ride_not_found", error: "Viaje no encontrado.", status: 404 };
    }
    const profileIds = await driverOnlineUpdateIdPool(
      supabase,
      String(profile.user_id),
      authOpts,
    );
    const assigned = profileIds.some((uid) => isSameUserId(uid, ride.driver_id));
    if (!assigned) {
      return { ok: false, code: "forbidden", error: "No autorizado para este viaje.", status: 403 };
    }
  }

  const patch: DriverLocationPatch = {
    last_lat: args.lat,
    last_lng: args.lng,
    last_location_at: new Date().toISOString(),
  };

  const profileIds = await driverOnlineUpdateIdPool(
    supabase,
    String(profile.user_id),
    authOpts,
  );

  const { data: updatedRows, error } = await supabase
    .from("driver_profiles")
    .update(patch)
    .in("user_id", profileIds)
    .select("user_id,is_online,is_active_driver,last_lat,last_lng,last_location_at");

  if (error) {
    console.error("[driver-location] update failed", error);
    return {
      ok: false,
      code: "update_failed",
      error: "No se pudo guardar la ubicación.",
      status: 500,
    };
  }

  const updated =
    (updatedRows ?? []).find(
      (row) => String(row.user_id).toLowerCase() === String(profile.user_id).toLowerCase(),
    ) ?? updatedRows?.[0];

  if (!updated) {
    return {
      ok: false,
      code: "update_failed",
      error: "No se pudo guardar la ubicación.",
      status: 500,
    };
  }

  return { ok: true, driver: updated as DriverProfileOnlineRow };
}
