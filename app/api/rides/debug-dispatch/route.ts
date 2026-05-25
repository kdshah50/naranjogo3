import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { COLONIAS } from "@/lib/colonias";
import { findNearbyDrivers } from "@/lib/rides/dispatch";
import { isRidesEnabled } from "@/lib/rides/flags";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/debug-dispatch?pickup_colonia=centro
 * Preview-only helper: why dispatch did or did not find drivers.
 */
export async function GET(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pickupColonia = req.nextUrl.searchParams.get("pickup_colonia")?.trim() ?? "centro";
  if (!COLONIAS[pickupColonia]) {
    return NextResponse.json({ error: "pickup_colonia inválida" }, { status: 400 });
  }

  const pickup = locationFromColoniaKey(pickupColonia);
  if (!pickup) {
    return NextResponse.json({ error: "No pickup location" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: profiles } = await supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver,is_online,service_colonias,last_lat,last_lng")
    .eq("is_active_driver", true);

  const profileRows = profiles ?? [];
  const pools = await Promise.all(
    profileRows.map(async (p) => ({
      user_id: p.user_id,
      pool: await expandUserAccountIdPool(supabase, String(p.user_id)),
      is_online: p.is_online,
      service_colonias: p.service_colonias,
    })),
  );

  const { data: listings } = await supabase
    .from("listings")
    .select("id,seller_id,title_es,is_verified,subcategory_kind,status")
    .eq("is_verified", true);

  const nearby = await findNearbyDrivers(supabase, {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    pickupColoniaKey: pickupColonia,
    limit: 5,
  });

  return NextResponse.json({
    pickup_colonia: pickupColonia,
    pickup,
    active_driver_profiles: profileRows.length,
    profiles: pools,
    verified_listings_sample: (listings ?? []).slice(0, 10),
    matched_drivers: nearby,
    hint:
      nearby.length === 0
        ? "Check: listing seller_id on same phone account pool as driver_profiles.user_id; subcategory_kind=ride or taxi title; service_colonias includes pickup; is_online + GPS or centro in colonias."
        : "Dispatch OK — rider needs saldo on /saldo if request still fails.",
  });
}
