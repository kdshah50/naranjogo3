import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { rideStatusToCode } from "@/lib/rides/ride-status-codes";

/** Slim ride payload for /viaje and /conductor/viajes. */
export function toClientRideRow(row: RideBookingRow) {
  return {
    id: row.id,
    status: row.status,
    pickup_address: row.pickup_address,
    dropoff_address: row.dropoff_address,
    estimated_total_mxn_cents: row.estimated_total_mxn_cents,
    hold_amount_mxn_cents: row.hold_amount_mxn_cents,
    final_total_mxn_cents: row.final_total_mxn_cents ?? null,
    ticket_code: row.ticket_code,
    driver_id: row.driver_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Uber/Didi-style push: server saw a new ride_events row (authoritative lifecycle step). */
export type RideLifecycleSsePayload = {
  event_type: string;
  to_status: string;
  status_code: number;
};

export type RideStreamSsePayload = {
  lifecycle?: RideLifecycleSsePayload;
  ride: ReturnType<typeof toClientRideRow>;
};

export function encodeSseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export function encodeSseKeepalive(): Uint8Array {
  return new TextEncoder().encode(`: keepalive ${Date.now()}\n\n`);
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

type RideChangeHandler = (row: RideBookingRow) => void;

export type RideEventInsertRow = {
  ride_id: string;
  event_type: string;
  to_status: string | null;
  from_status: string | null;
};

type RideEventInsertHandler = (row: RideEventInsertRow) => void;

/** Subscribe to ride_bookings changes; caller must removeChannel on abort. */
export function subscribeRideBookingChanges(
  supabase: SupabaseClient,
  args: { filter: string; onChange: RideChangeHandler },
): ReturnType<SupabaseClient["channel"]> {
  const channel = supabase
    .channel(`ride-stream-${args.filter}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ride_bookings",
        filter: args.filter,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as RideBookingRow | null;
        if (row?.id) args.onChange(row);
      },
    );
  void channel.subscribe();
  return channel;
}

/**
 * Subscribe to ride_events INSERT — primary Uber/Didi-style lifecycle signal.
 * Fires when driver accepts/arrives/starts/completes (append-only log).
 */
export function subscribeRideEventInserts(
  supabase: SupabaseClient,
  args: { rideId: string; onInsert: RideEventInsertHandler },
): ReturnType<SupabaseClient["channel"]> {
  const channel = supabase
    .channel(`ride-events-${args.rideId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "ride_events",
        filter: `ride_id=eq.${args.rideId}`,
      },
      (payload) => {
        const row = payload.new as RideEventInsertRow | null;
        if (row?.ride_id && row.event_type) args.onInsert(row);
      },
    );
  void channel.subscribe();
  return channel;
}

export function lifecyclePayloadFromEvent(
  eventType: string,
  toStatus: string,
): RideLifecycleSsePayload {
  return {
    event_type: eventType,
    to_status: toStatus,
    status_code: rideStatusToCode(toStatus),
  };
}
