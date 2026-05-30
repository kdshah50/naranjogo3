import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";

export function normalizeRideTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

/** If a completed row shares this ticket, drop older active duplicates (ghost rows). */
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

    const { data: completedRows } = await supabase
      .from("ride_bookings")
      .select("id, trip_ended_at, updated_at, created_at")
      .ilike("ticket_code", ticket)
      .eq("status", "completed")
      .order("trip_ended_at", { ascending: false })
      .limit(5);

    const rowCreatedMs = new Date(row.created_at).getTime();
    const isGhost = (completedRows ?? []).some((completed) => {
      if (String(completed.id) === String(row.id)) return false;
      const endedRaw = completed.trip_ended_at ?? completed.updated_at ?? completed.created_at;
      const endedMs = endedRaw ? new Date(endedRaw).getTime() : 0;
      // Hide stale duplicate rows for this ticket; keep rides created after the completion.
      return endedMs > 0 && rowCreatedMs <= endedMs;
    });

    if (isGhost) {
      if (!hideTickets.includes(ticket)) hideTickets.push(ticket);
      continue;
    }
    kept.push(row);
  }

  return { trips: kept, hideTickets };
}
