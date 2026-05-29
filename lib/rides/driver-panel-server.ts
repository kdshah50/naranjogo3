import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichDriverOnlineFromAccountPool,
  type DriverProfileOnlineRow,
} from "@/lib/rides/driver-account";
import { resolveDriverProfileForSession } from "@/lib/rides/resolve-driver-session";
import { getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { listActiveTripsForDriverProfile } from "@/lib/rides/ride-trip-server";

const DRIVER_ACTIVE_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);

function normalizeTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

/** If any row with this ticket is completed, drop active ghost duplicates (same ticket). */
async function dropActiveRowsWithCompletedTicket(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<{ trips: RideBookingRow[]; hideTickets: string[] }> {
  if (rows.length === 0) return { trips: [], hideTickets: [] };

  const tickets = [
    ...new Set(
      rows
        .map((r) => normalizeTicketCode(r.ticket_code))
        .filter(Boolean),
    ),
  ];
  if (tickets.length === 0) return { trips: rows, hideTickets: [] };

  const hideTickets: string[] = [];
  for (const ticket of tickets) {
    const { data } = await supabase
      .from("ride_bookings")
      .select("ticket_code")
      .ilike("ticket_code", ticket)
      .eq("status", "completed")
      .limit(1);
    if (data?.length) hideTickets.push(ticket);
  }
  if (hideTickets.length === 0) return { trips: rows, hideTickets: [] };

  const hideSet = new Set(hideTickets);
  return {
    trips: rows.filter((row) => {
      const ticket = normalizeTicketCode(row.ticket_code);
      return !ticket || !hideSet.has(ticket);
    }),
    hideTickets,
  };
}

/** Re-read each row by id so completed/cancelled trips never leak from stale list scans. */
async function verifyDriverPanelTrips(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  if (rows.length === 0) return [];
  const verified = await Promise.all(
    rows.map(async (row) => {
      const fresh = await getRideById(supabase, row.id);
      if (!fresh || !DRIVER_ACTIVE_STATUSES.has(fresh.status)) return null;
      return fresh;
    }),
  );
  return verified.filter((row): row is RideBookingRow => row !== null);
}

export type DriverPanelState = {
  driver: DriverProfileOnlineRow | null;
  trips: RideBookingRow[];
  canonical_user_id: string | null;
  session_user_id: string;
  auth_phone_set: boolean;
  /** Tickets that already have a completed row — client must not show active ghosts. */
  hide_tickets: string[];
};

/** Single load for /conductor/viajes — same profile + trips, no split-brain between APIs. */
export async function loadDriverPanel(
  supabase: SupabaseClient,
  args: { sessionUserId: string; authPhone: string | null },
): Promise<DriverPanelState> {
  const accountOpts = { authPhone: args.authPhone };
  const resolved = await resolveDriverProfileForSession(supabase, args);
  const driver = resolved
    ? await enrichDriverOnlineFromAccountPool(supabase, resolved, accountOpts)
    : null;

  const rawTrips =
    driver?.is_active_driver && driver.user_id
      ? await listActiveTripsForDriverProfile(supabase, driver.user_id, accountOpts)
      : [];
  const verified = await verifyDriverPanelTrips(supabase, rawTrips);
  const { trips, hideTickets } = await dropActiveRowsWithCompletedTicket(supabase, verified);

  return {
    driver,
    trips,
    canonical_user_id: driver?.user_id ?? null,
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
    hide_tickets: hideTickets,
  };
}
