import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLONIAS } from "@/lib/colonias";
import { findNearbyDrivers } from "@/lib/rides/dispatch";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export type DispatchDebugReport = {
  pickup_colonia: string | null;
  active_profiles: number;
  online_profiles: number;
  ride_listings_verified: number;
  matched_drivers: number;
  drivers: Awaited<ReturnType<typeof findNearbyDrivers>>;
  profiles: Array<{
    user_id: string;
    is_online: boolean;
    service_colonias: string[];
    has_ride_listing: boolean;
    listing_status: string | null;
    pool_size: number;
  }>;
  busy_rides: Array<{ id: string; status: string; driver_id: string }>;
  checks: string[];
};

export async function buildDispatchDebugReport(
  supabase: SupabaseClient,
  args: {
    pickupColoniaKey: string;
    pickupLat: number;
    pickupLng: number;
  },
): Promise<DispatchDebugReport> {
  const checks: string[] = [];
  const pickupKey = args.pickupColoniaKey;

  const { data: profiles } = await supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver,is_online,service_colonias")
    .eq("is_active_driver", true);

  const rows = profiles ?? [];
  const onlineCount = rows.filter((p) => p.is_online === true).length;

  if (rows.length === 0) {
    checks.push("No driver_profiles with is_active_driver=true — run approve SQL.");
  }
  if (onlineCount === 0) {
    checks.push("No driver is_online=true in DB — tap Conectar on /conductor/viajes (or set is_online in SQL).");
  }

  const profileDetails = await Promise.all(
    rows.map(async (p) => {
      const pool = await expandUserAccountIdPool(supabase, String(p.user_id));
      const { data: listings } = await supabase
        .from("listings")
        .select("id,subcategory_kind,title_es,is_verified,seller_id,status")
        .in("seller_id", pool)
        .eq("is_verified", true);

      const rideListing = (listings ?? []).find((l) => {
        const status = String(l.status ?? "").toLowerCase();
        if (status === "deleted" || status === "archived") return false;
        return (
          l.subcategory_kind === "ride" ||
          (l.subcategory_kind == null &&
            typeof l.title_es === "string" &&
            /taxi|transporte|ride/i.test(l.title_es))
        );
      });

      const colonias = (p.service_colonias as string[]) ?? [];
      const servesPickup =
        !pickupKey || colonias.length === 0 || colonias.includes(pickupKey);

      return {
        user_id: String(p.user_id),
        is_online: Boolean(p.is_online),
        service_colonias: colonias,
        has_ride_listing: Boolean(rideListing),
        listing_status: rideListing?.status != null ? String(rideListing.status) : null,
        pool_size: pool.length,
        pool_ids: pool.map((id) => id.toLowerCase()),
        serves_pickup: servesPickup,
      };
    }),
  );

  for (const d of profileDetails) {
    if (!d.has_ride_listing) {
      checks.push(
        `Driver ${d.user_id.slice(0, 8)}… has no verified ride listing on linked accounts — set subcategory_kind=ride on taxi listing.`,
      );
    }
    if (pickupKey && !d.serves_pickup && !d.is_online) {
      checks.push(
        `Driver ${d.user_id.slice(0, 8)}… service_colonias missing "${pickupKey}" and not online with GPS.`,
      );
    }
  }

  const { count: listingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("is_verified", true)
    .eq("subcategory_kind", "ride");

  const drivers = await findNearbyDrivers(supabase, {
    pickupLat: args.pickupLat,
    pickupLng: args.pickupLng,
    pickupColoniaKey: pickupKey,
    limit: 5,
  });

  const { data: busyRides } = await supabase
    .from("ride_bookings")
    .select("id,status,driver_id")
    .in("status", ["matched", "accepted", "arrived", "in_trip"])
    .not("driver_id", "is", null)
    .limit(20);

  const busyRows = (busyRides ?? []).map((r) => ({
    id: String(r.id),
    status: String(r.status),
    driver_id: String(r.driver_id),
  }));

  for (const d of profileDetails) {
    const blocked = busyRows.filter((r) => d.pool_ids.includes(r.driver_id.toLowerCase()));
    if (blocked.length > 0) {
      checks.push(
        `Driver ${d.user_id.slice(0, 8)}… blocked by active ride_booking (${blocked.map((b) => b.status).join(", ")}) — cancel or complete in SQL.`,
      );
    }
  }

  if (drivers.length === 0 && rows.length > 0) {
    checks.push(
      "Active drivers exist but dispatch filtered all out — listing status (null OK), busy rides, or colonias/distance.",
    );
  }
  if (drivers.length > 0) {
    checks.push("Dispatch found drivers — if /viaje still fails, check rider saldo on /saldo.");
  }

  if (pickupKey && !COLONIAS[pickupKey]) {
    checks.push(`Invalid pickup colonia key: ${pickupKey}`);
  }

  return {
    pickup_colonia: pickupKey,
    active_profiles: rows.length,
    online_profiles: onlineCount,
    ride_listings_verified: listingCount ?? 0,
    matched_drivers: drivers.length,
    drivers,
    profiles: profileDetails.map(({ serves_pickup: _s, pool_ids: _p, ...rest }) => rest),
    busy_rides: busyRows,
    checks,
  };
}
