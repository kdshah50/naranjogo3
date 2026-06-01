import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { normalizeRideTicketCode } from "@/lib/rides/ride-ghost-filter";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";
import type { RideAccountOptions } from "@/lib/rides/ride-trip-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

function rowTimeMs(row: RideBookingRow): number {
  const raw = row.updated_at ?? row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function tripMatchesBuyerPool(ride: RideBookingRow, pool: string[]): boolean {
  if (!ride.buyer_id) return false;
  return pool.some((id) => isSameUserId(id, ride.buyer_id));
}

/**
 * All ride_bookings rows for this ticket (any status), buyer-scoped.
 * When multiple rows exist (test ghosts), latest `updated_at` wins.
 */
export async function listRideBookingsByTicket(
  supabase: SupabaseClient,
  ticketCode: string,
  buyerPool: string[],
): Promise<RideBookingRow[]> {
  const ticket = normalizeRideTicketCode(ticketCode);
  if (!ticket || buyerPool.length === 0) return [];

  const { data, error } = await supabase
    .from("ride_bookings")
    .select("*")
    .ilike("ticket_code", ticket)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("[resolve-ride-by-ticket] list", error);
    return [];
  }

  return ((data ?? []) as RideBookingRow[]).filter((row) =>
    tripMatchesBuyerPool(row, buyerPool),
  );
}

/** Canonical row for a ticket — freshest DB update, re-fetched by id. */
export async function resolveCanonicalRideByTicket(
  supabase: SupabaseClient,
  ticketCode: string,
  buyerPool: string[],
): Promise<RideBookingRow | null> {
  const rows = await listRideBookingsByTicket(supabase, ticketCode, buyerPool);
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const tDiff = rowTimeMs(b) - rowTimeMs(a);
    if (tDiff !== 0) return tDiff;
    return rideStatusRank(b.status) - rideStatusRank(a.status);
  });

  const pick = sorted[0];
  const fresh = await getRideById(supabase, pick.id);
  return fresh ?? pick;
}

export async function resolveCanonicalRideByTicketForBuyer(
  supabase: SupabaseClient,
  buyerUserId: string,
  ticketCode: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow | null> {
  const pool = await expandUserAccountIdPool(supabase, buyerUserId, options);
  return resolveCanonicalRideByTicket(supabase, ticketCode, pool);
}
