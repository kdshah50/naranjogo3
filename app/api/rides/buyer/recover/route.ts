import { NextRequest, NextResponse } from "next/server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { isSameUserId } from "@/lib/auth-server";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import {
  applyEventTruthToRide,
  getRideByIdFresh,
} from "@/lib/rides/ride-bookings-server";
import { resolveCanonicalRideByTicketForBuyer } from "@/lib/rides/resolve-ride-by-ticket";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";
import { withStatusCode } from "@/lib/rides/ride-transition-pipeline";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

const BUYER_VISIBLE = new Set([
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
  "cancelled",
]);

async function hydrateBuyerRecoverRow(
  supabase: Parameters<typeof applyEventTruthToRide>[0],
  row: RideBookingRow,
): Promise<RideBookingRow> {
  const fromEvents = await applyEventTruthToRide(supabase, row);
  const fresh = await getRideByIdFresh(supabase, row.id, { attempts: 3, delayMs: 100 });
  if (!fresh) return fromEvents;
  const hydrated = await applyEventTruthToRide(supabase, fresh);
  return rideStatusRank(hydrated.status) >= rideStatusRank(fromEvents.status)
    ? hydrated
    : fromEvents;
}

/**
 * GET /api/rides/buyer/recover?ticket_code=NG-XXXXXXXX
 * GET /api/rides/buyer/recover?ride_id=uuid
 * Fast lookup for rider /viaje — event log is source of truth (not lagging booking row).
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ticketCode = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";
  const rideIdParam = req.nextUrl.searchParams.get("ride_id")?.trim() ?? "";
  if (!ticketCode && !rideIdParam) {
    return NextResponse.json(
      { error: "ticket_code or ride_id required", code: "missing_ticket" },
      { status: 400 },
    );
  }

  try {
    const accountOpts = { authPhone: guard.authPhone };
    const pool = await expandUserAccountIdPool(guard.supabase, guard.userId, accountOpts);

    let ride: RideBookingRow | null = null;
    if (ticketCode) {
      ride = await resolveCanonicalRideByTicketForBuyer(
        guard.supabase,
        guard.userId,
        ticketCode,
        accountOpts,
      );
    } else if (rideIdParam) {
      const fresh = await getRideByIdFresh(guard.supabase, rideIdParam, {
        attempts: 3,
        delayMs: 100,
      });
      if (fresh && pool.some((uid) => isSameUserId(uid, fresh.buyer_id))) {
        ride = fresh;
      }
    }

    const resolved = ride?.id != null ? await hydrateBuyerRecoverRow(guard.supabase, ride) : null;

    if (!resolved?.id) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode || null,
        reason: "not_found",
      });
    }

    if (!BUYER_VISIBLE.has(resolved.status)) {
      return NextResponse.json({
        ride: null,
        ticket_code: ticketCode,
        reason: `status_${resolved.status}`,
      });
    }

    const payload = withStatusCode(resolved) as RideBookingRow & { status_code: number };
    return NextResponse.json({
      ride: payload,
      ticket_code: ticketCode,
    });
  } catch (e) {
    console.error("[rides/buyer/recover] GET", e);
    return NextResponse.json({ error: "Recover failed", code: "recover_failed" }, { status: 500 });
  }
}
