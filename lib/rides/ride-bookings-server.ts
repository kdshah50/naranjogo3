import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTicketCodeCandidate } from "@/lib/booking-lifecycle";
import { pickBestDriver } from "@/lib/rides/dispatch";
import { pickCanonicalDriverProfile } from "@/lib/rides/driver-account";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";
import { estimateFare, type RideLocation } from "@/lib/rides/ride-pricing";
import { holdWalletForRide, hasHoldForRide, releaseWalletHoldForRide } from "@/lib/rides/wallet-hold";
import { getWalletForUser } from "@/lib/rides/wallet-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";

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
  trip_started_at?: string | null;
  trip_ended_at?: string | null;
  final_total_mxn_cents?: number | null;
  commission_mxn_cents?: number | null;
  tip_mxn_cents?: number | null;
  cancel_reason?: string | null;
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

/** Cancel older matched-only rides when a new match lands on the same driver account. */
async function cancelSupersededMatchedRides(
  supabase: SupabaseClient,
  args: { driverUserId: string; keepRideId: string },
): Promise<void> {
  const pool = await expandUserAccountIdPool(supabase, args.driverUserId);
  if (pool.length === 0) return;

  const { data: stale } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("driver_id", pool)
    .eq("status", "matched")
    .neq("id", args.keepRideId);

  for (const row of stale ?? []) {
    const staleRide = row as RideBookingRow;
    const buyerId = String(staleRide.buyer_id).trim().toLowerCase();
    const holdAmount = Math.round(Number(staleRide.hold_amount_mxn_cents));

    if (await hasHoldForRide(supabase, buyerId, staleRide.id)) {
      await releaseWalletHoldForRide(supabase, {
        userId: buyerId,
        rideBookingId: staleRide.id,
        releaseAmountMxnCents: holdAmount,
        meta: { reason: "superseded_by_new_match" },
      });
    }

    await supabase
      .from("ride_bookings")
      .update({
        status: "cancelled",
        cancel_reason: "superseded_by_new_match",
        updated_at: new Date().toISOString(),
      })
      .eq("id", staleRide.id)
      .eq("status", "matched");

    await appendRideEvent(supabase, {
      rideId: staleRide.id,
      eventType: "ride_cancelled",
      fromStatus: "matched",
      toStatus: "cancelled",
      meta: { reason: "superseded_by_new_match", replaced_by: args.keepRideId },
    });
  }
}

const BUYER_OPEN_STATUSES = ["requested", "matched", "accepted", "arrived", "in_trip"] as const;

async function findOpenRideForBuyer(
  supabase: SupabaseClient,
  buyerId: string,
): Promise<Pick<RideBookingRow, "id" | "status" | "ticket_code"> | null> {
  const pool = await expandUserAccountIdPool(supabase, buyerId);
  if (pool.length === 0) return null;
  const { data, error } = await supabase
    .from("ride_bookings")
    .select("id, status, ticket_code")
    .in("buyer_id", pool)
    .in("status", [...BUYER_OPEN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ride-bookings] findOpenRideForBuyer", error);
    return null;
  }
  return data as Pick<RideBookingRow, "id" | "status" | "ticket_code"> | null;
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
  | { ok: false; error: string; code?: "insufficient_balance" | "no_drivers" | "active_ride_exists" };

/**
 * Validates buyer has enough spendable saldo; hold is placed at match (Phase 4).
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

  const openTrip = await findOpenRideForBuyer(supabase, buyerId);
  if (openTrip) {
    return {
      ok: false,
      error: `Ya tienes un viaje activo (${openTrip.status}${openTrip.ticket_code ? ` · ${openTrip.ticket_code}` : ""}). Complétalo o cancélalo antes de solicitar otro.`,
      code: "active_ride_exists",
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
      const fresh = (await getRideById(supabase, ride.id)) ?? ride;
      if (match.code === "no_drivers") {
        return { ok: false, error: match.error, code: "no_drivers" };
      }
      return { ok: true, ride: fresh, estimate, matched: false };
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

/** Lifecycle steps logged in ride_events — probed directly when booking rows lag on replica. */
const RIDE_EVENT_TYPE_STATUS: ReadonlyArray<readonly [string, RideBookingStatus]> = [
  ["trip_completed", "completed"],
  ["trip_started", "in_trip"],
  ["driver_arrived", "arrived"],
  ["driver_accepted", "accepted"],
  ["driver_matched", "matched"],
  ["ride_requested", "requested"],
];

/**
 * ride_bookings reads on Vercel can lag minutes behind primary; ride_events
 * append-only log is fresher — use highest lifecycle status for client reads.
 */
async function latestStatusFromEvents(
  supabase: SupabaseClient,
  rideId: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<string | null> {
  const attempts = Math.min(Math.max(opts?.attempts ?? 8, 1), 12);
  const delayMs = opts?.delayMs ?? 400;
  let best: string | null = null;
  let bestRank = -2;

  for (let i = 0; i < attempts; i++) {
    for (const [eventType, status] of RIDE_EVENT_TYPE_STATUS) {
      const { data } = await supabase
        .from("ride_events")
        .select("id")
        .eq("ride_id", rideId)
        .eq("event_type", eventType)
        .limit(1)
        .maybeSingle();
      if (!data?.id) continue;
      const rank = rideStatusRank(status);
      if (rank > bestRank) {
        best = status;
        bestRank = rank;
      }
    }

    if (bestRank < rideStatusRank("completed")) {
      const { data, error } = await supabase
        .from("ride_events")
        .select("to_status")
        .eq("ride_id", rideId)
        .not("to_status", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) {
        console.error("[ride-bookings] latestStatusFromEvents", error);
      } else {
        for (const evt of data ?? []) {
          const status = String(evt.to_status ?? "").trim();
          if (!status) continue;
          const rank = rideStatusRank(status);
          if (rank > bestRank) {
            best = status;
            bestRank = rank;
          }
        }
      }
    }

    if (bestRank >= rideStatusRank("completed")) return best;
    if (i < attempts - 1) await sleepMs(delayMs);
  }
  return best;
}

/** Upgrade a booking row using ride_events when ride_bookings replica reads lag. */
export async function hydrateRideFromEvents(
  supabase: SupabaseClient,
  row: RideBookingRow,
): Promise<RideBookingRow> {
  if (row.status !== "completed" && row.status !== "cancelled") {
    if (await hasRideEvent(supabase, row.id, "trip_completed", { attempts: 10, delayMs: 350 })) {
      return resolveCompletedRideRow(supabase, row);
    }
  }

  const fromEvents = await latestStatusFromEvents(supabase, row.id);
  if (!fromEvents || rideStatusRank(fromEvents) <= rideStatusRank(row.status)) {
    return row;
  }

  // Terminal status from events — re-read booking row for final_total / trip_ended_at.
  if (fromEvents === "completed" || fromEvents === "cancelled") {
    return resolveCompletedRideRow(supabase, { ...row, status: fromEvents as RideBookingRow["status"] });
  }

  return { ...row, status: fromEvents as RideBookingRow["status"] };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Probe ride_events for a lifecycle step — booking rows can lag minutes on replica. */
export async function hasRideEvent(
  supabase: SupabaseClient,
  rideId: string,
  eventType: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
  const attempts = Math.min(Math.max(opts?.attempts ?? 8, 1), 16);
  const delayMs = opts?.delayMs ?? 300;
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase
      .from("ride_events")
      .select("id")
      .eq("ride_id", rideId)
      .eq("event_type", eventType)
      .limit(1)
      .maybeSingle();
    if (data?.id) return true;
    if (i < attempts - 1) await sleepMs(delayMs);
  }
  return false;
}

async function resolveCompletedRideRow(
  supabase: SupabaseClient,
  row: RideBookingRow,
): Promise<RideBookingRow> {
  for (let i = 0; i < 6; i++) {
    const fresh = await getRideById(supabase, row.id);
    if (fresh?.status === "completed" || fresh?.status === "cancelled") return fresh;
    if (i < 5) await sleepMs(400);
  }
  return { ...row, status: "completed" };
}

/**
 * Re-read a ride row with short retries — Vercel/Supabase read paths can lag
 * 1–2s behind primary after accept/complete. Returns the highest lifecycle
 * snapshot seen across attempts (so completed wins over stale matched).
 */
export async function getRideByIdFresh(
  supabase: SupabaseClient,
  rideId: string,
  opts?: { attempts?: number; delayMs?: number },
): Promise<RideBookingRow | null> {
  const attempts = Math.min(Math.max(opts?.attempts ?? 6, 1), 10);
  const delayMs = opts?.delayMs ?? 500;
  let best: RideBookingRow | null = null;
  let bestRank = -2;

  for (let i = 0; i < attempts; i++) {
    const row = await getRideById(supabase, rideId);
    if (row) {
      const hydrated = await hydrateRideFromEvents(supabase, row);
      const rank = rideStatusRank(hydrated.status);
      if (rank > bestRank) {
        best = hydrated;
        bestRank = rank;
      }
      if (hydrated.status === "completed" || hydrated.status === "cancelled") {
        return hydrated;
      }
    }
    if (i < attempts - 1) await sleepMs(delayMs);
  }
  if (best && best.status === "in_trip") {
    if (await hasRideEvent(supabase, rideId, "trip_completed", { attempts: 6, delayMs: 300 })) {
      return resolveCompletedRideRow(supabase, best);
    }
  }
  return best;
}

export type MatchRideResult =
  | { ok: true; ride: RideBookingRow; driverUserId: string }
  | { ok: false; error: string; code?: "no_drivers" | "invalid_state" | "insufficient_balance" };

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
    const sellerPool = await expandUserAccountIdPool(supabase, driverUserId);
    const { data: listings } = await supabase
      .from("listings")
      .select("id,subcategory_kind,title_es")
      .in("seller_id", sellerPool)
      .eq("is_verified", true)
      .limit(20);
    const rideListing = (listings ?? []).find(
      (row) =>
        row.subcategory_kind === "ride" ||
        (row.subcategory_kind == null &&
          typeof row.title_es === "string" &&
          /taxi|transporte|ride/i.test(row.title_es)),
    );
    listingId = rideListing?.id ? String(rideListing.id) : null;
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

  const canonical = await pickCanonicalDriverProfile(supabase, String(driverUserId));
  if (canonical?.user_id) {
    driverUserId = String(canonical.user_id).trim();
  } else {
    driverUserId = String(driverUserId).trim();
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

  const hold = await holdWalletForRide(supabase, {
    userId: String(updated.buyer_id).trim().toLowerCase(),
    rideBookingId: ride.id,
    holdAmountMxnCents: Math.round(Number(updated.hold_amount_mxn_cents)),
    meta: { ticket_code: ticketCode },
  });
  if (!hold.ok) {
    await supabase
      .from("ride_bookings")
      .update({
        driver_id: null,
        listing_id: null,
        status: "requested",
        ticket_code: null,
        matched_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ride.id);
    await appendRideEvent(supabase, {
      rideId: ride.id,
      eventType: "match_rolled_back",
      meta: { reason: hold.error, code: hold.code },
    });
    return {
      ok: false,
      error: hold.error || "No se pudo reservar saldo del pasajero",
      code: hold.code === "insufficient_balance" ? "insufficient_balance" : undefined,
    };
  }

  await appendRideEvent(supabase, {
    rideId: ride.id,
    eventType: "wallet_hold_placed",
    meta: {
      hold_amount_mxn_cents: Math.round(Number(updated.hold_amount_mxn_cents)),
      ledger_id: hold.ledgerId,
    },
  });

  await cancelSupersededMatchedRides(supabase, {
    driverUserId: String(driverUserId),
    keepRideId: ride.id,
  });

  return { ok: true, ride: updated as RideBookingRow, driverUserId: String(driverUserId) };
}
