import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";

export function normalizeRideTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

type TerminalSibling = {
  id: string;
  status: string;
  trip_ended_at: string | null;
  updated_at: string | null;
  created_at: string;
};

async function terminalSiblingsForTicket(
  supabase: SupabaseClient,
  ticket: string,
): Promise<TerminalSibling[]> {
  const { data: completedRows } = await supabase
    .from("ride_bookings")
    .select("id, status, trip_ended_at, updated_at, created_at")
    .ilike("ticket_code", ticket)
    .eq("status", "completed")
    .order("trip_ended_at", { ascending: false })
    .limit(5);

  const { data: cancelledRows } = await supabase
    .from("ride_bookings")
    .select("id, status, trip_ended_at, updated_at, created_at")
    .ilike("ticket_code", ticket)
    .eq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(5);

  return [...(completedRows ?? []), ...(cancelledRows ?? [])] as TerminalSibling[];
}

function rowTimeMs(row: {
  trip_ended_at?: string | null;
  updated_at?: string | null;
  created_at?: string;
}): number {
  const raw = row.trip_ended_at ?? row.updated_at ?? row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function pickBestActiveRow(rows: RideBookingRow[]): RideBookingRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const rankDiff = rideStatusRank(b.status) - rideStatusRank(a.status);
    if (rankDiff !== 0) return rankDiff;
    return rowTimeMs(b) - rowTimeMs(a);
  })[0];
}

/**
 * If a completed/cancelled row shares this ticket, drop stale active duplicates —
 * but keep the best active row when it was updated after the terminal trip (new E2E test).
 */
export async function dropActiveRowsWithCompletedTicket(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<{ trips: RideBookingRow[]; hideTickets: string[] }> {
  if (rows.length === 0) return { trips: [], hideTickets: [] };

  const hideTickets: string[] = [];
  const kept: RideBookingRow[] = [];
  const byTicket = new Map<string, RideBookingRow[]>();

  for (const row of rows) {
    const ticket = normalizeRideTicketCode(row.ticket_code);
    if (!ticket) {
      kept.push(row);
      continue;
    }
    const list = byTicket.get(ticket) ?? [];
    list.push(row);
    byTicket.set(ticket, list);
  }

  for (const [ticket, ticketRows] of byTicket) {
    const terminals = await terminalSiblingsForTicket(supabase, ticket);
    if (terminals.length === 0) {
      kept.push(...ticketRows);
      continue;
    }

    const terminalMs = Math.max(...terminals.map((t) => rowTimeMs(t)));
    const afterTerminal = ticketRows.filter((row) => rowTimeMs(row) > terminalMs);
    const candidatePool = afterTerminal.length > 0 ? afterTerminal : ticketRows;
    const best = pickBestActiveRow(candidatePool);

    if (!best) {
      hideTickets.push(ticket);
      continue;
    }

    // Stale duplicates only: terminal exists and this row is not newer than the completed trip.
    if (afterTerminal.length === 0 && terminals.some((t) => String(t.id) !== String(best.id))) {
      hideTickets.push(ticket);
      continue;
    }

    kept.push(best);
  }

  return { trips: kept, hideTickets };
}
