import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";

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

function isGhostActiveRow(row: RideBookingRow, terminals: TerminalSibling[]): boolean {
  const rowCreatedMs = new Date(row.created_at).getTime();
  return terminals.some((terminal) => {
    if (String(terminal.id) === String(row.id)) return false;
    const endedRaw = terminal.trip_ended_at ?? terminal.updated_at ?? terminal.created_at;
    const endedMs = endedRaw ? new Date(endedRaw).getTime() : 0;
    return endedMs > 0 && rowCreatedMs <= endedMs;
  });
}

/** If a completed/cancelled row shares this ticket, drop older active duplicates (ghost rows). */
export async function dropActiveRowsWithCompletedTicket(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<{ trips: RideBookingRow[]; hideTickets: string[] }> {
  if (rows.length === 0) return { trips: [], hideTickets: [] };

  const hideTickets: string[] = [];
  const kept: RideBookingRow[] = [];

  for (const row of rows) {
    const ticket = normalizeRideTicketCode(row.ticket_code);
    if (!ticket) {
      kept.push(row);
      continue;
    }

    const terminals = await terminalSiblingsForTicket(supabase, ticket);
    if (isGhostActiveRow(row, terminals)) {
      if (!hideTickets.includes(ticket)) hideTickets.push(ticket);
      continue;
    }
    kept.push(row);
  }

  return { trips: kept, hideTickets };
}
