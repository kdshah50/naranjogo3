import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";
import {
  appendRideEvent,
  applyEventTruthToRide,
  getRideById,
  getRideByIdFresh,
  type RideBookingRow,
  type RideBookingStatus,
} from "@/lib/rides/ride-bookings-server";
import { resolveCanonicalRideByTicketForBuyer } from "@/lib/rides/resolve-ride-by-ticket";
import { commitRidePhaseTransition } from "@/lib/rides/ride-transition-pipeline";
import {
  canTransitionRideStatus,
  cancelFeeApplies,
  computeCommissionMxnCents,
  driverPayoutMxnCents,
  RIDE_CANCEL_FEE_MXN_CENTS,
} from "@/lib/rides/ride-lifecycle";
import {
  captureFromBuyerWallet,
  creditDriverWallet,
  hasHoldForRide,
  releaseWalletHoldForRide,
} from "@/lib/rides/wallet-hold";
import { normalizeRideTicketCode } from "@/lib/rides/ride-ghost-filter";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";
import { driverRideAccountIdPool, findActiveDriverProfileForAccount } from "@/lib/rides/driver-account";
import { userIdsForAuthPhone } from "@/lib/resolve-login-user";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type RideAccountOptions = { authPhone?: string | null };

const ACTIVE_DRIVER_TRIP_STATUSES = ["matched", "accepted", "arrived", "in_trip"] as const;

async function driverIdPoolForTrips(
  supabase: SupabaseClient,
  profileUserId: string,
  options?: RideAccountOptions,
): Promise<string[]> {
  const pool = new Set<string>(
    await driverRideAccountIdPool(supabase, profileUserId, options),
  );
  for (const v of idMatchVariantsForIn(profileUserId)) pool.add(v);
  if (options?.authPhone) {
    const phoneIds = await userIdsForAuthPhone(supabase, options.authPhone);
    for (const id of phoneIds) {
      for (const v of idMatchVariantsForIn(id)) pool.add(v);
    }
  }
  return [...pool].filter(Boolean);
}

function tripMatchesDriverPool(ride: RideBookingRow, pool: string[]): boolean {
  if (!ride.driver_id) return false;
  return pool.some((id) => isSameUserId(id, ride.driver_id));
}

function rideMatchesDriverPool(ride: RideBookingRow, pool: string[]): boolean {
  if (!ride.driver_id || pool.length === 0) return false;
  const driverNorm = String(ride.driver_id).trim().toLowerCase();
  const poolNorm = new Set(pool.map((id) => id.trim().toLowerCase()));
  if (poolNorm.has(driverNorm)) return true;
  return tripMatchesDriverPool(ride, pool);
}

/** Active trips for driver account pool (duplicate phone users share assignments). */
export async function listActiveTripsForDriverProfile(
  supabase: SupabaseClient,
  profileUserId: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow[]> {
  const driverIds = await driverIdPoolForTrips(supabase, profileUserId, options);
  if (driverIds.length === 0) return [];

  const driverPool = [...new Set(driverIds.flatMap((id) => idMatchVariantsForIn(id)))];
  const statuses = [...ACTIVE_DRIVER_TRIP_STATUSES];

  const byId = new Map<string, RideBookingRow>();
  for (const driverId of driverPool.slice(0, 12)) {
    const { data, error } = await supabase
      .from("ride_bookings")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", [...statuses])
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) {
      console.error("[ride-trip] listActiveTripsForDriverProfile eq", error);
      continue;
    }
    for (const row of (data ?? []) as RideBookingRow[]) {
      if (rideMatchesDriverPool(row, driverPool)) byId.set(row.id, row);
    }
  }

  // Fallback scan only when targeted queries returned nothing — avoids stale rows from other drivers racing in.
  if (byId.size === 0) {
    const { data: recent, error: recentErr } = await supabase
      .from("ride_bookings")
      .select("*")
      .in("status", [...statuses])
      .not("driver_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);

    if (recentErr) {
      console.error("[ride-trip] listActiveTripsForDriverProfile scan", recentErr);
    } else {
      for (const row of (recent ?? []) as RideBookingRow[]) {
        if (rideMatchesDriverPool(row, driverPool)) byId.set(row.id, row);
      }
    }
  }

  const rows = [...byId.values()];

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows.slice(0, 20);
}

export async function listActiveTripsForDriver(
  supabase: SupabaseClient,
  driverUserId: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow[]> {
  const profile = await findActiveDriverProfileForAccount(supabase, driverUserId, options);
  if (!profile?.user_id) return [];
  return listActiveTripsForDriverProfile(supabase, profile.user_id, options);
}

export type TripResult =
  | { ok: true; ride: RideBookingRow }
  | { ok: false; error: string; code?: string };

/** Cancel any remaining open rows sharing this ticket (duplicate ghosts after complete). */
async function cancelOpenDuplicatesForTicket(
  supabase: SupabaseClient,
  args: { ticketCode: string | null | undefined; keepId: string },
): Promise<void> {
  const ticket = normalizeRideTicketCode(args.ticketCode);
  if (!ticket) return;

  const { data, error } = await supabase
    .from("ride_bookings")
    .select("id, status")
    .ilike("ticket_code", ticket)
    .in("status", [...ACTIVE_DRIVER_TRIP_STATUSES, "requested"])
    .neq("id", args.keepId);

  if (error) {
    console.error("[ride-trip] cancelOpenDuplicatesForTicket", error);
    return;
  }

  const now = new Date().toISOString();
  for (const row of data ?? []) {
    await supabase
      .from("ride_bookings")
      .update({
        status: "cancelled",
        cancel_reason: "duplicate_ticket_row",
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", row.status);
  }
}

/** Cancel extra open rows for the same ticket (test/preview duplicate ghosts). */
async function cancelDuplicateOpenRowsForTicket(
  supabase: SupabaseClient,
  args: { ticketCode: string | null | undefined; driverId: string; keepId: string },
): Promise<void> {
  const ticket = normalizeRideTicketCode(args.ticketCode);
  if (!ticket) return;

  const driverIds = idMatchVariantsForIn(args.driverId);
  const { data, error } = await supabase
    .from("ride_bookings")
    .select("id, status")
    .ilike("ticket_code", ticket)
    .in("driver_id", driverIds)
    .in("status", [...ACTIVE_DRIVER_TRIP_STATUSES])
    .neq("id", args.keepId);

  if (error) {
    console.error("[ride-trip] cancelDuplicateOpenRowsForTicket", error);
    return;
  }

  const now = new Date().toISOString();
  for (const row of data ?? []) {
    await supabase
      .from("ride_bookings")
      .update({
        status: "cancelled",
        cancel_reason: "duplicate_ticket_row",
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", row.status);
  }
}

/** Cancel stale open rows for this driver after a trip completes (preview hygiene). */
async function cancelOtherOpenRidesForDriver(
  supabase: SupabaseClient,
  args: { driverId: string; keepId: string },
): Promise<void> {
  const pool = await expandUserAccountIdPool(supabase, args.driverId);
  const driverIds = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  if (driverIds.length === 0) return;

  const now = new Date().toISOString();
  await supabase
    .from("ride_bookings")
    .update({
      status: "cancelled",
      cancel_reason: "superseded_by_complete",
      updated_at: now,
    })
    .in("driver_id", driverIds)
    .in("status", [...ACTIVE_DRIVER_TRIP_STATUSES])
    .neq("id", args.keepId);
}

async function updateRideStatus(
  supabase: SupabaseClient,
  rideId: string,
  fromStatus: string,
  patch: Record<string, unknown>
): Promise<RideBookingRow | null> {
  const { data, error } = await supabase
    .from("ride_bookings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", rideId)
    .eq("status", fromStatus)
    .select("*")
    .maybeSingle();

  if (error) console.error("[ride-trip] updateRideStatus", error);
  return (data as RideBookingRow) ?? null;
}

const STATUS_CHAIN = [
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
] as const;

/** Event-hydrated read — gates POST accept/arrive/start/complete. */
async function getRideForTransition(
  supabase: SupabaseClient,
  rideId: string,
): Promise<RideBookingRow | null> {
  return getRideByIdFresh(supabase, rideId, { attempts: 4, delayMs: 200 });
}

/**
 * Advance ride_bookings toward target, walking the replica forward when it lags
 * behind ride_events (common on Supabase read replicas).
 */
async function transitionRideStatus(
  supabase: SupabaseClient,
  rideId: string,
  targetStatus: RideBookingStatus,
  effectiveStatus: RideBookingStatus,
  patch: Record<string, unknown> = {},
): Promise<RideBookingRow | null> {
  if (effectiveStatus === targetStatus) {
    return getRideForTransition(supabase, rideId);
  }

  const targetIdx = STATUS_CHAIN.indexOf(targetStatus as (typeof STATUS_CHAIN)[number]);
  if (targetIdx < 0) return null;

  let raw = await getRideById(supabase, rideId);
  if (!raw) return null;

  for (let step = 0; step < 6; step++) {
    if (raw.status === targetStatus) return raw;

    const curIdx = STATUS_CHAIN.indexOf(raw.status as (typeof STATUS_CHAIN)[number]);
    if (curIdx < 0 || curIdx >= targetIdx) break;

    const next = STATUS_CHAIN[curIdx + 1];
    const stepPatch =
      next === targetStatus ? { status: targetStatus, ...patch } : { status: next };
    const updated = await updateRideStatus(supabase, rideId, raw.status, stepPatch);
    if (updated) {
      raw = updated;
      continue;
    }

    const reread = await getRideById(supabase, rideId);
    if (!reread) break;
    if (reread.status === raw.status) break;
    raw = reread;
  }

  const fresh = await getRideForTransition(supabase, rideId);
  if (fresh?.status === targetStatus) return fresh;
  return null;
}

export async function userCanAccessRide(
  supabase: SupabaseClient,
  userId: string,
  ride: RideBookingRow,
  options?: RideAccountOptions,
): Promise<"buyer" | "driver" | null> {
  const buyerPool = await expandUserAccountIdPool(supabase, userId, options);
  if (buyerPool.some((id) => isSameUserId(id, ride.buyer_id))) return "buyer";
  if (ride.driver_id) {
    const driverPool = await driverRideAccountIdPool(supabase, userId, options);
    if (driverPool.some((id) => isSameUserId(id, ride.driver_id))) return "driver";
  }
  return null;
}

export async function userIsDriverForRide(
  supabase: SupabaseClient,
  userId: string,
  ride: RideBookingRow,
  options?: RideAccountOptions,
): Promise<boolean> {
  if (!ride.driver_id) return false;
  const pool = await driverRideAccountIdPool(supabase, userId, options);
  if (pool.some((id) => isSameUserId(id, ride.driver_id))) return true;
  return (await userCanAccessRide(supabase, userId, ride, options)) === "driver";
}

export async function acceptRide(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideForTransition(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (ride.status === "accepted") {
    return { ok: true, ride };
  }
  if (!canTransitionRideStatus(ride.status, "accepted")) {
    return {
      ok: false,
      error: `No se puede aceptar en este estado (${ride.status})`,
      code: "invalid_state",
    };
  }

  let updated = await transitionRideStatus(supabase, ride.id, "accepted", ride.status);
  if (!updated) {
    const fresh = await getRideForTransition(supabase, ride.id);
    if (fresh?.status === "accepted") {
      updated = fresh;
    } else {
      return { ok: false, error: "No se pudo aceptar el viaje", code: "invalid_state" };
    }
  }

  if (updated.driver_id) {
    await cancelDuplicateOpenRowsForTicket(supabase, {
      ticketCode: updated.ticket_code,
      driverId: updated.driver_id,
      keepId: updated.id,
    });
  }
  const freshAfter = await getRideForTransition(supabase, updated.id);
  if (freshAfter) updated = freshAfter;

  const pipeline = await commitRidePhaseTransition(supabase, {
    ride: updated,
    phase: "accepted",
    driverUserId: args.driverUserId,
    actorId: args.driverUserId,
    eventType: "driver_accepted",
    fromStatus: "matched",
    toStatus: "accepted",
  });

  return { ok: true, ride: pipeline.ok ? pipeline.ride : updated };
}

export async function arriveAtPickup(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideForTransition(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (ride.status === "arrived") {
    return { ok: true, ride };
  }
  if (!canTransitionRideStatus(ride.status, "arrived")) {
    return { ok: false, error: "No se puede marcar llegada ahora", code: "invalid_state" };
  }

  const updated = await transitionRideStatus(supabase, ride.id, "arrived", ride.status);
  if (!updated) {
    const fresh = await getRideForTransition(supabase, ride.id);
    if (fresh?.status === "arrived") return { ok: true, ride: fresh };
    return { ok: false, error: "No se pudo marcar llegada" };
  }

  if (updated.driver_id) {
    await cancelDuplicateOpenRowsForTicket(supabase, {
      ticketCode: updated.ticket_code,
      driverId: updated.driver_id,
      keepId: updated.id,
    });
  }

  const pipeline = await commitRidePhaseTransition(supabase, {
    ride: updated,
    phase: "arrived",
    driverUserId: args.driverUserId,
    actorId: args.driverUserId,
    eventType: "driver_arrived",
    fromStatus: "accepted",
    toStatus: "arrived",
  });

  return { ok: true, ride: pipeline.ok ? pipeline.ride : updated };
}

export async function startTrip(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; ticketCode: string; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideForTransition(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (ride.status === "in_trip") {
    return { ok: true, ride };
  }
  if (!canTransitionRideStatus(ride.status, "in_trip")) {
    return { ok: false, error: "No se puede iniciar el viaje ahora", code: "invalid_state" };
  }

  const normalized = normalizeNgTicketQuery(args.ticketCode);
  const expected = normalizeNgTicketQuery(ride.ticket_code);
  if (!normalized || !expected || normalized !== expected) {
    return { ok: false, error: "Código de viaje incorrecto", code: "invalid_ticket" };
  }

  const now = new Date().toISOString();
  const updated = await transitionRideStatus(supabase, ride.id, "in_trip", ride.status, {
    trip_started_at: now,
  });
  if (!updated) {
    const fresh = await getRideForTransition(supabase, ride.id);
    if (fresh?.status === "in_trip") return { ok: true, ride: fresh };
    return { ok: false, error: "No se pudo iniciar el viaje" };
  }

  if (updated.driver_id) {
    await cancelDuplicateOpenRowsForTicket(supabase, {
      ticketCode: updated.ticket_code,
      driverId: updated.driver_id,
      keepId: updated.id,
    });
  }

  const pipeline = await commitRidePhaseTransition(supabase, {
    ride: updated,
    phase: "in_trip",
    driverUserId: args.driverUserId,
    actorId: args.driverUserId,
    eventType: "trip_started",
    fromStatus: "arrived",
    toStatus: "in_trip",
    eventMeta: { ticket_verified: true },
  });

  return { ok: true, ride: pipeline.ok ? pipeline.ride : updated };
}

export async function completeTrip(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; finalTotalMxnCents?: number; authPhone?: string | null }
): Promise<TripResult> {
  let ride = await getRideForTransition(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (ride.status === "completed") {
    return { ok: true, ride };
  }
  if (!canTransitionRideStatus(ride.status, "completed")) {
    return { ok: false, error: "No se puede completar el viaje ahora", code: "invalid_state" };
  }
  if (!ride.driver_id) return { ok: false, error: "Sin conductor asignado" };

  if (ride.status !== "in_trip") {
    const caughtUp = await transitionRideStatus(supabase, ride.id, "in_trip", ride.status);
    ride = caughtUp ?? (await getRideForTransition(supabase, ride.id));
    if (!ride || (ride.status !== "in_trip" && ride.status !== "completed")) {
      return { ok: false, error: "No se puede completar el viaje ahora", code: "invalid_state" };
    }
    if (ride.status === "completed") return { ok: true, ride };
  }

  const finalTotal = Math.round(
    Number(args.finalTotalMxnCents ?? ride.estimated_total_mxn_cents)
  );
  if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
    return { ok: false, error: "Tarifa final inválida" };
  }

  const holdAmount = Math.round(Number(ride.hold_amount_mxn_cents));
  const commission = computeCommissionMxnCents(finalTotal);
  const driverPay = driverPayoutMxnCents(finalTotal);
  const now = new Date().toISOString();

  const buyerId = String(ride.buyer_id).trim().toLowerCase();
  const driverId = String(ride.driver_id).trim().toLowerCase();

  if (await hasHoldForRide(supabase, buyerId, ride.id)) {
    const rel = await releaseWalletHoldForRide(supabase, {
      userId: buyerId,
      rideBookingId: ride.id,
      releaseAmountMxnCents: holdAmount,
      meta: { reason: "trip_complete" },
    });
    if (!rel.ok) return { ok: false, error: rel.error, code: rel.code };
  }

  const cap = await captureFromBuyerWallet(supabase, {
    userId: buyerId,
    rideBookingId: ride.id,
    captureAmountMxnCents: finalTotal,
    meta: { capture_kind: "fare", commission_mxn_cents: commission },
  });
  if (!cap.ok) return { ok: false, error: cap.error, code: cap.code };

  if (driverPay > 0) {
    const cred = await creditDriverWallet(supabase, {
      userId: driverId,
      rideBookingId: ride.id,
      amountMxnCents: driverPay,
      meta: { payout_kind: "fare", commission_mxn_cents: commission },
    });
    if (!cred.ok) return { ok: false, error: cred.error };
  }

  let completed = await transitionRideStatus(supabase, ride.id, "completed", "in_trip", {
    final_total_mxn_cents: finalTotal,
    commission_mxn_cents: commission,
    trip_ended_at: now,
  });
  if (!completed) {
    const fresh = await getRideForTransition(supabase, ride.id);
    if (fresh?.status === "completed") {
      completed = fresh;
    } else {
      console.error("[ride-trip] complete update failed");
      return { ok: false, error: "No se pudo completar el viaje" };
    }
  }

  if (completed.driver_id) {
    await cancelDuplicateOpenRowsForTicket(supabase, {
      ticketCode: completed.ticket_code,
      driverId: completed.driver_id,
      keepId: completed.id,
    });
    await cancelOpenDuplicatesForTicket(supabase, {
      ticketCode: completed.ticket_code,
      keepId: completed.id,
    });
    await cancelOtherOpenRidesForDriver(supabase, {
      driverId: completed.driver_id,
      keepId: completed.id,
    });
  }

  const pipeline = await commitRidePhaseTransition(supabase, {
    ride: completed,
    phase: "completed",
    driverUserId: driverId,
    actorId: args.driverUserId,
    eventType: "trip_completed",
    fromStatus: "in_trip",
    toStatus: "completed",
    eventMeta: {
      final_total_mxn_cents: finalTotal,
      commission_mxn_cents: commission,
      driver_payout: driverPay,
    },
    finalTotalMxnCents: finalTotal,
    driverPayoutMxnCents: driverPay,
  });

  return { ok: true, ride: pipeline.ok ? pipeline.ride : completed };
}

export async function cancelRide(
  supabase: SupabaseClient,
  args: { rideId: string; actorUserId: string; reason?: string }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };

  const role = await userCanAccessRide(supabase, args.actorUserId, ride);
  if (!role) return { ok: false, error: "No autorizado", code: "forbidden" };
  if (!canTransitionRideStatus(ride.status, "cancelled")) {
    return { ok: false, error: "No se puede cancelar en este estado", code: "invalid_state" };
  }

  const buyerId = String(ride.buyer_id).trim().toLowerCase();
  const holdAmount = Math.round(Number(ride.hold_amount_mxn_cents));
  const hadHold = await hasHoldForRide(supabase, buyerId, ride.id);

  if (hadHold) {
    const rel = await releaseWalletHoldForRide(supabase, {
      userId: buyerId,
      rideBookingId: ride.id,
      releaseAmountMxnCents: holdAmount,
      meta: { reason: "cancelled", cancelled_by: role },
    });
    if (!rel.ok) return { ok: false, error: rel.error, code: rel.code };

    if (role === "buyer" && cancelFeeApplies(ride.matched_at)) {
      const fee = Math.min(RIDE_CANCEL_FEE_MXN_CENTS, holdAmount);
      if (fee > 0) {
        await captureFromBuyerWallet(supabase, {
          userId: buyerId,
          rideBookingId: ride.id,
          captureAmountMxnCents: fee,
          meta: { capture_kind: "cancel_fee" },
        });
      }
    }
  }

  const { data: updated, error } = await supabase
    .from("ride_bookings")
    .update({
      status: "cancelled",
      cancel_reason: args.reason ?? `cancelled_by_${role}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ride.id)
    .eq("status", ride.status)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, error: "No se pudo cancelar el viaje" };
  }

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.actorUserId,
    eventType: "ride_cancelled",
    fromStatus: ride.status,
    toStatus: "cancelled",
    meta: { reason: args.reason ?? null, role },
  });

  return { ok: true, ride: updated as RideBookingRow };
}

export async function addTipToRide(
  supabase: SupabaseClient,
  args: { rideId: string; buyerUserId: string; tipMxnCents: number }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };

  const role = await userCanAccessRide(supabase, args.buyerUserId, ride);
  if (role !== "buyer") return { ok: false, error: "No autorizado", code: "forbidden" };
  if (ride.status !== "completed") {
    return { ok: false, error: "Solo puedes dar propina después del viaje", code: "invalid_state" };
  }
  if (!ride.driver_id) return { ok: false, error: "Sin conductor" };

  const tip = Math.round(Number(args.tipMxnCents));
  if (!Number.isFinite(tip) || tip <= 0) return { ok: false, error: "Propina inválida" };

  const buyerId = String(ride.buyer_id).trim().toLowerCase();
  const driverId = String(ride.driver_id).trim().toLowerCase();

  const cap = await captureFromBuyerWallet(supabase, {
    userId: buyerId,
    rideBookingId: ride.id,
    captureAmountMxnCents: tip,
    meta: { capture_kind: "tip" },
  });
  if (!cap.ok) return { ok: false, error: cap.error, code: cap.code };

  const cred = await creditDriverWallet(supabase, {
    userId: driverId,
    rideBookingId: ride.id,
    amountMxnCents: tip,
    meta: { payout_kind: "tip" },
  });
  if (!cred.ok) return { ok: false, error: cred.error };

  const existingTip = Math.round(Number((ride as RideBookingRow & { tip_mxn_cents?: number }).tip_mxn_cents ?? 0));
  const { data: updated, error } = await supabase
    .from("ride_bookings")
    .update({
      tip_mxn_cents: existingTip + tip,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ride.id)
    .select("*")
    .maybeSingle();

  if (error || !updated) return { ok: false, error: "No se pudo registrar la propina" };

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.buyerUserId,
    eventType: "tip_added",
    meta: { tip_mxn_cents: tip },
  });

  return { ok: true, ride: updated as RideBookingRow };
}

export async function disputeRide(
  supabase: SupabaseClient,
  args: { rideId: string; buyerUserId: string; reason?: string }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };

  const role = await userCanAccessRide(supabase, args.buyerUserId, ride);
  if (role !== "buyer") return { ok: false, error: "No autorizado", code: "forbidden" };
  if (!canTransitionRideStatus(ride.status, "disputed")) {
    return { ok: false, error: "No se puede disputar este viaje", code: "invalid_state" };
  }

  const { data: updated, error } = await supabase
    .from("ride_bookings")
    .update({
      status: "disputed",
      cancel_reason: args.reason ?? "buyer_dispute",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ride.id)
    .eq("status", "completed")
    .select("*")
    .maybeSingle();

  if (error || !updated) return { ok: false, error: "No se pudo abrir la disputa" };

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.buyerUserId,
    eventType: "ride_disputed",
    fromStatus: "completed",
    toStatus: "disputed",
    meta: { reason: args.reason ?? null },
  });

  return { ok: true, ride: updated as RideBookingRow };
}

function tripMatchesBuyerPool(ride: RideBookingRow, pool: string[]): boolean {
  if (!ride.buyer_id) return false;
  return pool.some((id) => isSameUserId(id, ride.buyer_id));
}

const ACTIVE_BUYER_TRIP_STATUSES = ["requested", "matched", "accepted", "arrived", "in_trip"] as const;

async function refreshOpenBuyerRows(
  supabase: SupabaseClient,
  rows: RideBookingRow[],
): Promise<RideBookingRow[]> {
  const openSet = new Set<string>(ACTIVE_BUYER_TRIP_STATUSES);
  const freshRows: RideBookingRow[] = [];
  for (const row of rows) {
    const fresh = await getRideByIdFresh(supabase, row.id);
    if (fresh && openSet.has(fresh.status)) freshRows.push(fresh);
  }
  freshRows.sort((a, b) => {
    const rankDiff = rideStatusRank(b.status) - rideStatusRank(a.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return freshRows;
}

function buyerRowTimeMs(row: RideBookingRow): number {
  const raw = row.updated_at ?? row.created_at;
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Highest lifecycle open row — duplicate ticket ghosts often sit at matched. */
export function pickBestOpenBuyerRideRow(rows: RideBookingRow[]): RideBookingRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const rankDiff = rideStatusRank(b.status) - rideStatusRank(a.status);
    if (rankDiff !== 0) return rankDiff;
    return buyerRowTimeMs(b) - buyerRowTimeMs(a);
  })[0];
}

export async function listActiveTripsForBuyer(
  supabase: SupabaseClient,
  buyerUserId: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow[]> {
  const pool = await expandUserAccountIdPool(supabase, buyerUserId, options);
  if (pool.length === 0) return [];

  const buyerPool = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  const statuses = [...ACTIVE_BUYER_TRIP_STATUSES];

  const byId = new Map<string, RideBookingRow>();

  // Buyer-scoped recent rows (no status filter) — replica status column often lags minutes.
  const { data: byBuyer, error: byBuyerErr } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("buyer_id", buyerPool)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (byBuyerErr) {
    console.error("[ride-trip] listActiveTripsForBuyer by buyer", byBuyerErr);
  } else {
    for (const row of ((byBuyer ?? []) as RideBookingRow[]).filter((r) =>
      tripMatchesBuyerPool(r, pool),
    )) {
      byId.set(row.id, row);
    }
  }

  // Secondary: status-filtered query when buyer pool is empty on replica.
  if (byId.size === 0) {
    const { data, error } = await supabase
      .from("ride_bookings")
      .select("*")
      .in("buyer_id", buyerPool)
      .in("status", [...statuses])
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("[ride-trip] listActiveTripsForBuyer", error);
    } else {
      for (const row of ((data ?? []) as RideBookingRow[]).filter((r) =>
        tripMatchesBuyerPool(r, pool),
      )) {
        byId.set(row.id, row);
      }
    }
  }

  if (byId.size === 0) {
    const { data: recent, error: recentErr } = await supabase
      .from("ride_bookings")
      .select("*")
      .in("status", [...statuses])
      .order("created_at", { ascending: false })
      .limit(40);

    if (recentErr) {
      console.error("[ride-trip] listActiveTripsForBuyer scan", recentErr);
    } else {
      for (const row of (recent ?? []) as RideBookingRow[]) {
        if (tripMatchesBuyerPool(row, pool)) byId.set(row.id, row);
      }
    }
  }

  const rows = [...byId.values()];
  rows.sort((a, b) => {
    const rankDiff = rideStatusRank(b.status) - rideStatusRank(a.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const freshRows = await refreshOpenBuyerRows(supabase, rows);
  return freshRows.slice(0, 5);
}

const BUYER_DISPLAY_LOOKBACK_MS = 48 * 60 * 60 * 1000;

const BUYER_DISPLAY_STATUSES = [
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
  "cancelled",
] as const;

function pickLatestBuyerRideRow(rows: RideBookingRow[]): RideBookingRow | null {
  if (rows.length === 0) return null;

  const active = rows.filter((r) => r.status !== "completed" && r.status !== "cancelled");
  if (active.length > 0) {
    return pickBestOpenBuyerRideRow(active);
  }

  const terminal = rows.filter((r) => r.status === "completed" || r.status === "cancelled");
  return (
    [...terminal].sort(
      (a, b) =>
        new Date(b.trip_ended_at ?? b.updated_at ?? b.created_at).getTime() -
        new Date(a.trip_ended_at ?? a.updated_at ?? a.created_at).getTime(),
    )[0] ?? null
  );
}

/**
 * Most relevant buyer ride for /viaje — prefers completed over stale in_trip rows
 * left in DB from testing (rank), then latest updated_at.
 */
export async function latestBuyerRideForDisplay(
  supabase: SupabaseClient,
  buyerUserId: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow | null> {
  const pool = await expandUserAccountIdPool(supabase, buyerUserId, options);
  if (pool.length === 0) return null;

  const buyerPool = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  const since = new Date(Date.now() - BUYER_DISPLAY_LOOKBACK_MS).toISOString();
  const statuses = [...BUYER_DISPLAY_STATUSES];

  const { data, error } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("buyer_id", buyerPool)
    .in("status", statuses)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(15);

  let rows = ((data ?? []) as RideBookingRow[]).filter((r) => tripMatchesBuyerPool(r, pool));

  if (rows.length === 0) {
    const { data: recent, error: recentErr } = await supabase
      .from("ride_bookings")
      .select("*")
      .in("status", statuses)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (recentErr) {
      console.error("[ride-trip] latestBuyerRideForDisplay fallback", recentErr);
    } else {
      rows = (recent ?? []).filter((r) => tripMatchesBuyerPool(r as RideBookingRow, pool));
    }
  }

  return pickLatestBuyerRideRow(rows);
}

const BUYER_HISTORY_STATUSES = [
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
  "completed",
  "cancelled",
] as const;

function dedupeBuyerRidesByTicket(rows: RideBookingRow[]): RideBookingRow[] {
  const byTicket = new Map<string, RideBookingRow>();
  for (const row of rows) {
    const key = normalizeRideTicketCode(row.ticket_code) || row.id;
    const cur = byTicket.get(key);
    if (!cur) {
      byTicket.set(key, row);
      continue;
    }
    const rankDiff = rideStatusRank(row.status) - rideStatusRank(cur.status);
    if (rankDiff > 0 || (rankDiff === 0 && buyerRowTimeMs(row) > buyerRowTimeMs(cur))) {
      byTicket.set(key, row);
    }
  }
  return [...byTicket.values()].sort((a, b) => buyerRowTimeMs(b) - buyerRowTimeMs(a));
}

/** Recent taxi/ride rows for /my-bookings — event-hydrated, one row per NG- ticket. */
export async function listBuyerRideHistory(
  supabase: SupabaseClient,
  buyerUserId: string,
  options?: RideAccountOptions & { limit?: number; ticketHint?: string | null },
): Promise<RideBookingRow[]> {
  const accountOpts = { authPhone: options?.authPhone ?? null };
  const pool = await expandUserAccountIdPool(supabase, buyerUserId, accountOpts);
  if (pool.length === 0) return [];

  const buyerPool = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  const limit = Math.min(Math.max(options?.limit ?? 12, 1), 30);
  const ticketHint = normalizeNgTicketQuery(options?.ticketHint ?? "");

  const byId = new Map<string, RideBookingRow>();

  if (ticketHint) {
    const pinned = await resolveCanonicalRideByTicketForBuyer(
      supabase,
      buyerUserId,
      ticketHint,
      accountOpts,
    );
    if (pinned?.id) byId.set(pinned.id, pinned);
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("buyer_id", buyerPool)
    .in("status", [...BUYER_HISTORY_STATUSES])
    .gte("created_at", since)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[ride-trip] listBuyerRideHistory", error);
  } else {
    for (const row of (data ?? []) as RideBookingRow[]) {
      if (tripMatchesBuyerPool(row, pool)) byId.set(row.id, row);
    }
  }

  const hydrated: RideBookingRow[] = [];
  for (const row of byId.values()) {
    const fresh = (await getRideByIdFresh(supabase, row.id, { attempts: 3, delayMs: 150 })) ?? row;
    hydrated.push(await applyEventTruthToRide(supabase, fresh));
  }

  return dedupeBuyerRidesByTicket(hydrated).slice(0, limit);
}
