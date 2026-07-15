import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import type { RideDriverPublic } from "@/lib/rides/driver-public";
import { normalizeRideRowAddressesFromDb } from "@/lib/rides/ride-address-pii";
import { isEncryptedPiiValue } from "@/lib/pii-crypto";
import { rideStatusToCode } from "@/lib/rides/ride-status-codes";
import { rideRouteSummaryFromRow } from "@/lib/rides/ride-route-summary";

/** Slim ride payload for /viaje and /conductor/viajes. Never send ciphertext to the browser. */
export function toClientRideRow(row: RideBookingRow, lang: "es" | "en" = "es") {
  const decrypted = normalizeRideRowAddressesFromDb(row);
  let pickup = decrypted.pickup_address;
  let dropoff = decrypted.dropoff_address;
  if (isEncryptedPiiValue(pickup) || isEncryptedPiiValue(dropoff)) {
    const summary = rideRouteSummaryFromRow(decrypted, lang);
    if (isEncryptedPiiValue(pickup)) pickup = summary.pickup_zone;
    if (isEncryptedPiiValue(dropoff)) dropoff = summary.dropoff_zone;
  }
  return {
    id: decrypted.id,
    status: decrypted.status,
    pickup_address: pickup,
    dropoff_address: dropoff,
    pickup_colonia: decrypted.pickup_colonia ?? null,
    dropoff_colonia: decrypted.dropoff_colonia ?? null,
    estimated_total_mxn_cents: decrypted.estimated_total_mxn_cents,
    hold_amount_mxn_cents: decrypted.hold_amount_mxn_cents,
    final_total_mxn_cents: decrypted.final_total_mxn_cents ?? null,
    ticket_code: decrypted.ticket_code,
    driver_id: decrypted.driver_id,
    pickup_lat: decrypted.pickup_lat,
    pickup_lng: decrypted.pickup_lng,
    dropoff_lat: decrypted.dropoff_lat,
    dropoff_lng: decrypted.dropoff_lng,
    created_at: decrypted.created_at,
    updated_at: decrypted.updated_at,
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
  driver_public?: RideDriverPublic | null;
  location_update?: boolean;
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

type DriverProfileLocationRow = {
  user_id: string;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

type DriverLocationHandler = (row: DriverProfileLocationRow) => void;

/** Push driver GPS updates to rider SSE when driver_profiles.last_lat changes. */
export function subscribeDriverProfileLocation(
  supabase: SupabaseClient,
  args: { driverUserId: string; onChange: DriverLocationHandler },
): ReturnType<SupabaseClient["channel"]> {
  const channel = supabase
    .channel(`driver-loc-${args.driverUserId}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "driver_profiles",
        filter: `user_id=eq.${args.driverUserId}`,
      },
      (payload) => {
        const row = payload.new as DriverProfileLocationRow | null;
        if (row?.user_id) args.onChange(row);
      },
    );
  void channel.subscribe();
  return channel;
}
