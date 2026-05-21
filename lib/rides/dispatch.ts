import type { SupabaseClient } from "@supabase/supabase-js";
import { COLONIAS, type ColoniaInfo } from "@/lib/colonias";
import { haversineMeters } from "@/lib/rides/ride-pricing";

export type NearbyDriver = {
  user_id: string;
  listing_id: string;
  listing_title: string | null;
  distance_m: number;
  colonia_key: string;
  colonia_label: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  service_colonias: string[];
};

const ACTIVE_RIDE_STATUSES = ["requested", "matched", "accepted", "arrived", "in_trip"];

function coloniaCenter(key: string): ColoniaInfo | null {
  const c = COLONIAS[key];
  if (!c || key === "otro") return null;
  return c;
}

function driverServesColonia(serviceColonias: string[], pickupColoniaKey: string | null): boolean {
  if (!pickupColoniaKey) return true;
  if (serviceColonias.length === 0) return true;
  return serviceColonias.includes(pickupColoniaKey);
}

/**
 * Find approved drivers near a pickup point. Uses colonia centroids (Mapbox Matrix deferred).
 */
export async function findNearbyDrivers(
  supabase: SupabaseClient,
  args: {
    pickupLat: number;
    pickupLng: number;
    pickupColoniaKey?: string | null;
    limit?: number;
    maxDistanceM?: number;
  }
): Promise<NearbyDriver[]> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
  const maxDistanceM = args.maxDistanceM ?? 8000;

  const { data: profiles, error: pErr } = await supabase
    .from("driver_profiles")
    .select(
      "user_id,vehicle_make,vehicle_model,vehicle_color,service_colonias,is_active_driver"
    )
    .eq("is_active_driver", true);

  if (pErr) {
    console.error("[rides/dispatch] driver_profiles", pErr);
    return [];
  }

  if (!profiles?.length) return [];

  const userIds = profiles.map((p) => String(p.user_id));
  const { data: listings } = await supabase
    .from("listings")
    .select("id,seller_id,title_es,is_verified,subcategory_kind,status")
    .in("seller_id", userIds)
    .eq("subcategory_kind", "ride")
    .eq("is_verified", true)
    .neq("status", "deleted");

  const listingBySeller = new Map<string, { id: string; title_es: string | null }>();
  for (const row of listings ?? []) {
    const sid = String(row.seller_id).toLowerCase();
    if (!listingBySeller.has(sid)) {
      listingBySeller.set(sid, { id: String(row.id), title_es: row.title_es as string | null });
    }
  }

  const { data: busyRides } = await supabase
    .from("ride_bookings")
    .select("driver_id")
    .in("status", ACTIVE_RIDE_STATUSES)
    .not("driver_id", "is", null);

  const busyDriverIds = new Set(
    (busyRides ?? []).map((r) => String(r.driver_id).toLowerCase())
  );

  const candidates: NearbyDriver[] = [];

  for (const profile of profiles) {
    const uid = String(profile.user_id).toLowerCase();
    if (busyDriverIds.has(uid)) continue;

    const listing = listingBySeller.get(uid);
    if (!listing) continue;

    const serviceColonias = (profile.service_colonias as string[]) ?? [];
    if (!driverServesColonia(serviceColonias, args.pickupColoniaKey ?? null)) continue;

    let bestKey = args.pickupColoniaKey ?? serviceColonias[0] ?? "centro";
    let bestDist = Number.POSITIVE_INFINITY;
    let bestLabel = COLONIAS[bestKey]?.label ?? bestKey;

    const keysToTry =
      serviceColonias.length > 0 ? serviceColonias : Object.keys(COLONIAS).filter((k) => k !== "otro");

    for (const key of keysToTry) {
      const center = coloniaCenter(key);
      if (!center) continue;
      const d = haversineMeters(args.pickupLat, args.pickupLng, center.lat, center.lng);
      if (d < bestDist) {
        bestDist = d;
        bestKey = key;
        bestLabel = center.label;
      }
    }

    if (bestDist > maxDistanceM) continue;

    candidates.push({
      user_id: String(profile.user_id),
      listing_id: listing.id,
      listing_title: listing.title_es,
      distance_m: Math.round(bestDist),
      colonia_key: bestKey,
      colonia_label: bestLabel,
      vehicle_make: String(profile.vehicle_make),
      vehicle_model: String(profile.vehicle_model),
      vehicle_color: String(profile.vehicle_color),
      service_colonias: serviceColonias,
    });
  }

  candidates.sort((a, b) => a.distance_m - b.distance_m);
  return candidates.slice(0, limit);
}

export async function pickBestDriver(
  supabase: SupabaseClient,
  args: Parameters<typeof findNearbyDrivers>[1]
): Promise<NearbyDriver | null> {
  const list = await findNearbyDrivers(supabase, { ...args, limit: 1 });
  return list[0] ?? null;
}
