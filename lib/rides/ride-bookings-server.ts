import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTicketCodeCandidate } from "@/lib/booking-lifecycle";
import { pickBestDriver } from "@/lib/rides/dispatch";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";
import { estimateFare, type RideLocation } from "@/lib/rides/ride-pricing";
import { getWalletForUser } from "@/lib/rides/wallet-server";

export type RideBookingStatus =
  | "requested"
  | "matched"
  | "accepted"
  | "arrived"
  | "in_trip"
  | "completed"
  | "cancelled"
  | "disputed";

export type RideBookingRow = {
  id: string;
  buyer_id: string;
  driver_id: string | null;
  listing_id: string | null;
  status: RideBookingStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  passengers: number;
  luggage: string | null;
  language: string | null;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
  distance_m: number | null;
  duration_s: number | null;
  ticket_code: string | null;
  matched_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function appendRideEvent(
  supabase: SupabaseClient,
  args: {
    rideId: string;
    eventType: string;
    actorId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("ride_events").insert({
    ride_id: args.rideId,
    actor_id: args.actorId ?? null,
    event_type: args.eventType,
    from_status: args.fromStatus ?? null,
    to_status: args.toStatus ?? null,
    meta: args.meta ?? {},
  });
  if (error) {
    console.error("[ride-bookings] appendRideEvent", error);
  }
}

async function ensureUniqueTicketCode(supabase: SupabaseClient): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = generateTicketCodeCandidate();
    const { data } = await supabase
      .from("ride_bookings")
      .select("id")
      .eq("ticket_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return generateTicketCodeCandidate();
}

export type CreateRideRequestArgs = {
  buyerId: string;
  pickup: RideLocation;
  dropoff: RideLocation;
  pickupColoniaKey?: string | null;
  dropoffColoniaKey?: string | null;
  passengers?: number;
  luggage?: string | null;
  language?: string | null;
  source?: string;
  autoMatch?: boolean;
};

export type CreateRideRequestResult =
  | { ok: true; ride: RideBookingRow; estimate: ReturnType<typeof estimateFare>; matched: boolean }
  | { ok: false; error: string; code?: "insufficient_balance" | "no_drivers" };

/**
 * Balance check only — wallet hold/capture is Phase 4.
 */
export async function createRideRequest(
  supabase: SupabaseClient,
  args: CreateRideRequestArgs
): Promise<CreateRideRequestResult> {
  const buyerId = String(args.buyerId).trim().toLowerCase();
  if (!buyerId) return { ok: false, error: "buyerId required" };

  const passengers = Math.min(Math.max(args.passengers ?? 1, 1), 8);
  const estimate = estimateFare(args.pickup, args.dropoff);

  const wallet = await getWalletForUser(supabase, buyerId, { ledgerLimit: 1 });
  if (wallet.balance_mxn_cents < estimate.hold_amount_mxn_cents) {
    return {
      ok: false,
      error: `Saldo insuficiente. Necesitas al menos $${Math.ceil(estimate.hold_amount_mxn_cents / 100)} MXN disponibles.`,
      code: "insufficient_balance",
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("ride_bookings")
    .insert({
      buyer_id: buyerId,
      status: "requested",
      pickup_lat: args.pickup.lat,
      pickup_lng: args.pickup.lng,
      pickup_address: args.pickup.address,
      dropoff_lat: args.dropoff.lat,
      dropoff_lng: args.dropoff.lng,
      dropoff_address: args.dropoff.address,
      passengers,
      luggage: args.luggage ?? null,
      language: args.language ?? "es",
      estimated_total_mxn_cents: estimate.estimated_total_mxn_cents,
      hold_amount_mxn_cents: estimate.hold_amount_mxn_cents,
      distance_m: estimate.distance_m,
      duration_s: estimate.duration_s,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    console.error("[ride-bookings] insert", insErr);
    return { ok: false, error: "No se pudo crear el viaje" };
  }

  const ride = inserted as RideBookingRow;

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: buyerId,
    eventType: "ride_requested",
    toStatus: "requested",
    meta: {
      source: args.source ?? "api",
      pickup_colonia: args.pickupColoniaKey ?? null,
      dropoff_colonia: args.dropoffColoniaKey ?? null,
      estimate,
    },
  });

  if (args.autoMatch) {
    const match = await matchRideToDriver(supabase, {
      rideId: ride.id,
      pickupColoniaKey: args.pickupColoniaKey ?? null,
    });
    if (!match.ok) {
      return { ok: true, ride: (await getRideById(supabase, ride.id)) ?? ride, estimate, matched: false };
    }
    const fresh = await getRideById(supabase, ride.id);
    return { ok: true, ride: fresh ?? ride, estimate, matched: true };
  }

  return { ok: true, ride, estimate, matched: false };
}

export async function getRideById(
  supabase: SupabaseClient,
  rideId: string
): Promise<RideBookingRow | null> {
  const { data, error } = await supabase.from("ride_bookings").select("*").eq("id", rideId).maybeSingle();
  if (error) {
    console.error("[ride-bookings] getRideById", error);
    return null;
  }
  return (data as RideBookingRow) ?? null;
}

export type MatchRideResult =
  | { ok: true; ride: RideBookingRow; driverUserId: string }
  | { ok: false; error: string; code?: "no_drivers" | "invalid_state" };

export async function matchRideToDriver(
  supabase: SupabaseClient,
  args: { rideId: string; pickupColoniaKey?: string | null; driverUserId?: string | null }
): Promise<MatchRideResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  if (ride.status !== "requested") {
    return { ok: false, error: "El viaje ya fue asignado o cancelado", code: "invalid_state" };
  }

  let driverUserId = args.driverUserId ?? null;
  let listingId: string | null = null;

  if (driverUserId) {
    const { data: listing } = await supabase
      .from("listings")
      .select("id")
      .eq("seller_id", driverUserId)
      .eq("subcategory_kind", "ride")
      .eq("is_verified", true)
      .limit(1)
      .maybeSingle();
    listingId = listing?.id ? String(listing.id) : null;
    if (!listingId) return { ok: false, error: "Conductor no disponible", code: "no_drivers" };
  } else {
    const best = await pickBestDriver(supabase, {
      pickupLat: ride.pickup_lat,
      pickupLng: ride.pickup_lng,
      pickupColoniaKey: args.pickupColoniaKey ?? null,
      limit: 1,
    });
    if (!best) {
      await supabase
        .from("ride_bookings")
        .update({
          status: "cancelled",
          cancel_reason: "no_drivers_available",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ride.id);
      await appendRideEvent(supabase, {
        rideId: ride.id,
        eventType: "ride_cancelled",
        fromStatus: "requested",
        toStatus: "cancelled",
        meta: { reason: "no_drivers_available" },
      });
      return { ok: false, error: "No hay conductores disponibles en este momento", code: "no_drivers" };
    }
    driverUserId = best.user_id;
    listingId = best.listing_id;
  }

  const ticketCode = await ensureUniqueTicketCode(supabase);
  const matchedAt = new Date().toISOString();

  const { data: updated, error: upErr } = await supabase
    .from("ride_bookings")
    .update({
      driver_id: driverUserId,
      listing_id: listingId,
      status: "matched",
      ticket_code: ticketCode,
      matched_at: matchedAt,
      updated_at: matchedAt,
    })
    .eq("id", ride.id)
    .eq("status", "requested")
    .select("*")
    .maybeSingle();

  if (upErr || !updated) {
    console.error("[ride-bookings] match update", upErr);
    return { ok: false, error: "No se pudo asignar conductor" };
  }

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: driverUserId,
    eventType: "driver_matched",
    fromStatus: "requested",
    toStatus: "matched",
    meta: { driver_user_id: driverUserId, listing_id: listingId, ticket_code: ticketCode },
  });

  return { ok: true, ride: updated as RideBookingRow, driverUserId: String(driverUserId) };
}
