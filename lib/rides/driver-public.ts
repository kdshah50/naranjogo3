import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RideDriverPublic = {
  display_name: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_plates: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

export async function loadDriverPublic(
  supabase: SupabaseClient,
  driverUserId: string,
): Promise<RideDriverPublic | null> {
  const id = String(driverUserId ?? "").trim();
  if (!id) return null;

  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase
      .from("driver_profiles")
      .select(
        "vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_plates,last_lat,last_lng,last_location_at",
      )
      .eq("user_id", id)
      .maybeSingle(),
    supabase.from("users").select("display_name").eq("id", id).maybeSingle(),
  ]);

  if (!profile && !user?.display_name) return null;

  return {
    display_name: user?.display_name ?? null,
    vehicle_make: profile?.vehicle_make ?? null,
    vehicle_model: profile?.vehicle_model ?? null,
    vehicle_year: profile?.vehicle_year ?? null,
    vehicle_color: profile?.vehicle_color ?? null,
    vehicle_plates: profile?.vehicle_plates ?? null,
    last_lat: profile?.last_lat ?? null,
    last_lng: profile?.last_lng ?? null,
    last_location_at: profile?.last_location_at ?? null,
  };
}
