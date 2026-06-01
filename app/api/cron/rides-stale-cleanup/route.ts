import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { cancelStaleActiveRides } from "@/lib/rides/stale-ride-cleanup-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron: cancel ride_bookings active >24h (preview hygiene, Phase 0).
 * GET with Authorization: Bearer ${CRON_SECRET}
 *
 * Runs when RIDES_ENABLED=true. Skips production unless RIDES_STALE_CLEANUP=true.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRidesEnabled()) {
    return NextResponse.json({ skipped: true, reason: "RIDES_ENABLED=false" });
  }

  const vercelEnv = process.env.VERCEL_ENV ?? "";
  const allowProd = process.env.RIDES_STALE_CLEANUP === "true";
  if (vercelEnv === "production" && !allowProd) {
    return NextResponse.json({ skipped: true, reason: "production (set RIDES_STALE_CLEANUP=true to enable)" });
  }

  const supabase = createAdminSupabase();
  const result = await cancelStaleActiveRides(supabase, {
    maxAgeHours: 24,
    cancelReason: "stale_auto_cleanup",
  });

  return NextResponse.json({
    ok: true,
    cancelled: result.cancelled_ride_ids.length,
    released_holds: result.released_holds,
    ride_ids: result.cancelled_ride_ids.map((id) => id.slice(0, 8)),
  });
}
