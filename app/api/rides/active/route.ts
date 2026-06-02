import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { dropActiveRowsWithCompletedTicket } from "@/lib/rides/ride-ghost-filter";
import { resolveCanonicalRideByTicketForBuyer } from "@/lib/rides/resolve-ride-by-ticket";
import {
  latestBuyerRideForDisplay,
  listActiveTripsForBuyer,
  listActiveTripsForDriver,
  pickBestOpenBuyerRideRow,
} from "@/lib/rides/ride-trip-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";

export const dynamic = "force-dynamic";

const BUYER_OPEN_STATUSES = new Set(["requested", "matched", "accepted", "arrived", "in_trip"]);
const DRIVER_OPEN_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);

async function verifyDriverActiveTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
      if (!fresh || !DRIVER_OPEN_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

async function verifyBuyerActiveTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
      if (!fresh || !BUYER_OPEN_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

async function explainBuyerTripDrop(
  supabase: SupabaseClient,
  rawRows: RideBookingRow[],
  postGhostRows: RideBookingRow[],
  hideTickets: string[],
): Promise<string | null> {
  if (rawRows.length === 0) return null;
  if (postGhostRows.length === 0 && hideTickets.length > 0) {
    return `ghost:${hideTickets[0]}`;
  }
  const row = postGhostRows[0] ?? rawRows[0];
  const fresh = await getRideById(supabase, row.id);
  if (!fresh || !BUYER_OPEN_STATUSES.has(fresh.status)) {
    return `verify:${fresh?.status ?? "missing"}`;
  }
  return null;
}

/** GET /api/rides/active — current user's in-progress rides (buyer or driver). */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const accountOpts = { authPhone: guard.authPhone };
  const pool = await expandUserAccountIdPool(guard.supabase, guard.userId, accountOpts);

  const { data: profile } = await guard.supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver")
    .in("user_id", pool)
    .eq("is_active_driver", true)
    .limit(1)
    .maybeSingle();

  const asDriver = Boolean(profile?.user_id);
  const reconcileRideId = req.nextUrl.searchParams.get("reconcile_ride_id")?.trim();
  const ticketCodeParam = req.nextUrl.searchParams.get("ticket_code")?.trim() ?? "";

  let canonicalByTicket: RideBookingRow | null = null;
  if (ticketCodeParam) {
    canonicalByTicket = await resolveCanonicalRideByTicketForBuyer(
      guard.supabase,
      guard.userId,
      ticketCodeParam,
      accountOpts,
    );
  }

  const [buyerTripsRaw, buyerDisplayRaw, driverTripsRaw] = await Promise.all([
    listActiveTripsForBuyer(guard.supabase, guard.userId, accountOpts),
    latestBuyerRideForDisplay(guard.supabase, guard.userId, accountOpts),
    asDriver ? listActiveTripsForDriver(guard.supabase, guard.userId, accountOpts) : Promise.resolve([]),
  ]);

  const { trips: driverTripsGhostFiltered } = await dropActiveRowsWithCompletedTicket(
    guard.supabase,
    driverTripsRaw,
  );
  const asDriverVerified = await verifyDriverActiveTrips(guard.supabase, driverTripsGhostFiltered);

  const { trips: buyerActiveTripsRaw, hideTickets } = await dropActiveRowsWithCompletedTicket(
    guard.supabase,
    buyerTripsRaw,
  );
  let buyerActiveTrips = await verifyBuyerActiveTrips(guard.supabase, buyerActiveTripsRaw);

  let reconciledRide: RideBookingRow | null = null;
  if (reconcileRideId) {
    const ride = await getRideById(guard.supabase, reconcileRideId);
    if (ride && pool.some((uid) => isSameUserId(uid, ride.buyer_id))) {
      reconciledRide = ride;
      if (BUYER_OPEN_STATUSES.has(ride.status)) {
        const [verified] = await verifyBuyerActiveTrips(guard.supabase, [ride]);
        if (verified && !buyerActiveTrips.some((t) => t.id === verified.id)) {
          buyerActiveTrips = [verified, ...buyerActiveTrips];
        }
      }
    }
  }

  let primaryBuyerActive: RideBookingRow | null =
    pickBestOpenBuyerRideRow(buyerActiveTrips);
  if (primaryBuyerActive?.ticket_code) {
    const canonical = await resolveCanonicalRideByTicketForBuyer(
      guard.supabase,
      guard.userId,
      primaryBuyerActive.ticket_code,
      accountOpts,
    );
    if (canonical && BUYER_OPEN_STATUSES.has(canonical.status)) {
      const [verified] = await verifyBuyerActiveTrips(guard.supabase, [canonical]);
      primaryBuyerActive = verified ?? canonical;
    }
  }
  if (canonicalByTicket) {
    if (BUYER_OPEN_STATUSES.has(canonicalByTicket.status)) {
      const [verified] = await verifyBuyerActiveTrips(guard.supabase, [canonicalByTicket]);
      const canonicalActive = verified ?? canonicalByTicket;
      if (
        !primaryBuyerActive ||
        rideStatusRank(canonicalActive.status) >= rideStatusRank(primaryBuyerActive.status)
      ) {
        primaryBuyerActive = canonicalActive;
      }
      if (verified && !buyerActiveTrips.some((t) => t.id === verified.id)) {
        buyerActiveTrips = [verified, ...buyerActiveTrips];
      }
    } else {
      primaryBuyerActive = null;
    }
  }

  const dropReason =
    buyerTripsRaw.length > 0 && buyerActiveTrips.length === 0
      ? await explainBuyerTripDrop(
          guard.supabase,
          buyerTripsRaw,
          buyerActiveTripsRaw,
          hideTickets,
        )
      : null;

  let buyerDisplay = buyerDisplayRaw;
  if (
    buyerDisplayRaw &&
    BUYER_OPEN_STATUSES.has(buyerDisplayRaw.status)
  ) {
    const { trips: filtered } = await dropActiveRowsWithCompletedTicket(guard.supabase, [
      buyerDisplayRaw,
    ]);
    if (filtered.length === 0) buyerDisplay = null;
  }

  return NextResponse.json(
    {
      as_buyer: buyerActiveTrips,
      as_buyer_active: primaryBuyerActive,
      as_buyer_display: buyerDisplay,
      as_buyer_has_open: buyerActiveTrips.length > 0,
      as_driver: asDriverVerified,
      reconciled_ride: reconciledRide,
      canonical_by_ticket: canonicalByTicket,
      debug: {
        user_id: guard.userId.slice(0, 8),
        pool_size: pool.length,
        raw_buyer_count: buyerTripsRaw.length,
        post_ghost_count: buyerActiveTripsRaw.length,
        verified_count: buyerActiveTrips.length,
        ghost_hidden_tickets: hideTickets,
        drop_reason: dropReason,
        reconcile_id: reconcileRideId ? reconcileRideId.slice(0, 8) : null,
        ticket_code: ticketCodeParam ? ticketCodeParam.slice(0, 12) : null,
        canonical_ticket_status: canonicalByTicket?.status ?? null,
        canonical_ticket_id: canonicalByTicket?.id
          ? String(canonicalByTicket.id).slice(0, 8)
          : null,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
