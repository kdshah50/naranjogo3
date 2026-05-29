import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";

export function normalizeRideTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

/** If any row with this ticket is completed, drop active ghost duplicates (same ticket). */
export async function dropActiveRowsWithCompletedTicket(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<{ trips: RideBookingRow[]; hideTickets: string[] }> {
  if (rows.length === 0) return { trips: [], hideTickets: [] };

  const tickets = [
    ...new Set(rows.map((r) => normalizeRideTicketCode(r.ticket_code)).filter(Boolean)),
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
      const ticket = normalizeRideTicketCode(row.ticket_code);
      return !ticket || !hideSet.has(ticket);
    }),
    hideTickets,
  };
}
