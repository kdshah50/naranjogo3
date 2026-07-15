import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import {
  applyEventTruthToRide,
  getRideById,
  getRideByIdFresh,
  getRideLifecycleStatusFromEvents,
  type RideBookingRow,
} from "@/lib/rides/ride-bookings-server";
import {
  listRideBookingsByTicket,
  resolveCanonicalRideByTicketForBuyer,
} from "@/lib/rides/resolve-ride-by-ticket";
import { withStatusCode } from "@/lib/rides/ride-transition-pipeline";
import type { RideDriverPublic } from "@/lib/rides/ride-sync-server";
import { toClientRideRow } from "@/lib/rides/ride-stream-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

const DRIVER_PUBLIC_STATUSES = new Set([
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
]);

function rowTimeMs(row: RideBookingRow): number {
  const raw = row.updated_at ?? row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

async function hydrateRowFromEvents(
  supabase: SupabaseClient,
  row: RideBookingRow,
): Promise<RideBookingRow> {
  const fresh =
    (await getRideByIdFresh(supabase, row.id, { attempts: 4, delayMs: 150 })) ?? row;
  const fromEvents = await applyEventTruthToRide(supabase, fresh);
  const logStatus = await getRideLifecycleStatusFromEvents(supabase, row.id);
  if (logStatus && rideStatusRank(logStatus) > rideStatusRank(fromEvents.status)) {
    return { ...fromEvents, status: logStatus as RideBookingRow["status"] };
  }
  return fromEvents;
}

/**
 * Collect pinned ride id + ticket canonical + all sibling rows; pick highest
 * lifecycle from ride_events (fixes ghost matched row vs accepted real row).
 */
async function pickBestBuyerRideRow(
  supabase: SupabaseClient,
  args: {
    pool: string[];
    sessionUserId: string;
    authPhone: string | null;
    ticket: string;
    rideId: string;
  },
): Promise<RideBookingRow | null> {
  const accountOpts = { authPhone: args.authPhone };
  const byId = new Map<string, RideBookingRow>();

  if (args.rideId) {
    const pinned = await getRideById(supabase, args.rideId);
    if (pinned && args.pool.some((uid) => isSameUserId(uid, pinned.buyer_id))) {
      byId.set(pinned.id, pinned);
    }
  }

  if (args.ticket) {
    const canonical = await resolveCanonicalRideByTicketForBuyer(
      supabase,
      args.sessionUserId,
      args.ticket,
      accountOpts,
    );
    if (canonical?.id) byId.set(canonical.id, canonical);

    for (const sibling of await listRideBookingsByTicket(
      supabase,
      args.ticket,
      args.pool,
    )) {
      if (sibling?.id) byId.set(sibling.id, sibling);
    }
  }

  if (byId.size === 0) return null;

  let best: RideBookingRow | null = null;
  let bestRank = -2;

  for (const row of byId.values()) {
    const truth = await hydrateRowFromEvents(supabase, row);
    const rank = rideStatusRank(truth.status);
    if (
      rank > bestRank ||
      (rank === bestRank && best && rowTimeMs(truth) > rowTimeMs(best))
    ) {
      best = truth;
      bestRank = rank;
    }
  }

  return best;
}

async function loadDriverPublic(
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

export type BuyerRideTruthState = {
  ride: ReturnType<typeof toClientRideRow> & { status_code: number };
  driver_public: RideDriverPublic | null;
  status_source: "ride_events";
};

/**
 * Single authoritative read for rider /viaje — lifecycle status comes from
 * append-only ride_events, not lagging ride_bookings replica reads.
 */
export async function getBuyerRideTruthState(
  supabase: SupabaseClient,
  args: {
    sessionUserId: string;
    authPhone: string | null;
    rideId?: string | null;
    ticketCode?: string | null;
  },
): Promise<BuyerRideTruthState | null> {
  const accountOpts = { authPhone: args.authPhone };
  const pool = await expandUserAccountIdPool(supabase, args.sessionUserId, accountOpts);
  const ticket = String(args.ticketCode ?? "").trim();
  const rideId = String(args.rideId ?? "").trim();

  const fresh = await pickBestBuyerRideRow(supabase, {
    pool,
    sessionUserId: args.sessionUserId,
    authPhone: args.authPhone,
    ticket,
    rideId,
  });

  if (!fresh?.id) return null;

  const coded = withStatusCode(fresh);
  const ride = {
    ...toClientRideRow(fresh),
    status_code: coded.status_code,
  };

  let driverPublic: RideDriverPublic | null = null;
  if (ride.driver_id && DRIVER_PUBLIC_STATUSES.has(ride.status)) {
    driverPublic = await loadDriverPublic(supabase, ride.driver_id);
  }

  return {
    ride,
    driver_public: driverPublic,
    status_source: "ride_events",
  };
}
