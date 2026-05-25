import { NextRequest, NextResponse } from "next/server";
import { loadDriverPanel } from "@/lib/rides/driver-panel-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/drivers/me/panel
 * Driver online status + assigned trips in one response (canonical profile user_id).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const panel = await loadDriverPanel(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
  });

  return NextResponse.json(panel, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
