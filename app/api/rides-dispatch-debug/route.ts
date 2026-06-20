import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { COLONIAS } from "@/lib/colonias";
import { buildDispatchDebugReport } from "@/lib/rides/dispatch-debug";
import { isRidesEnabled } from "@/lib/rides/flags";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides-dispatch-debug?pickup_colonia=centro
 * Preview helper — why dispatch did or did not find drivers.
 * (Not under /api/rides/[id] — that path treats "debug-dispatch" as a ride UUID.)
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
  const report = await buildDispatchDebugReport(supabase, {
    pickupColoniaKey: pickupColonia,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
  });

  return NextResponse.json({ pickup, ...report });
}
