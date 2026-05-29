import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isSameUserId } from "@/lib/auth-server";
import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";
import { appendRideEvent, getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { emitRidePhaseNotifications } from "@/lib/rides/ride-notify";
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

  // Always merge fallback scan — eq-only pass can miss new trips when stale rows exist for pool ids.
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
  const ride = await getRideById(supabase, args.rideId);
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

  let updated = await updateRideStatus(supabase, ride.id, "matched", { status: "accepted" });
  if (!updated && ride.status === "matched") {
    const { data: retry } = await supabase
      .from("ride_bookings")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", ride.id)
      .select("*")
      .maybeSingle();
    updated = (retry as RideBookingRow) ?? null;
  }
  if (!updated) {
    const fresh = await getRideById(supabase, ride.id);
    if (fresh?.status === "accepted") return { ok: true, ride: fresh };
    return { ok: false, error: "No se pudo aceptar el viaje", code: "invalid_state" };
  }

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.driverUserId,
    eventType: "driver_accepted",
    fromStatus: "matched",
    toStatus: "accepted",
  });

  void emitRidePhaseNotifications(supabase, {
    ride: updated,
    phase: "accepted",
    driverUserId: args.driverUserId,
  });

  return { ok: true, ride: updated };
}

export async function arriveAtPickup(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (!canTransitionRideStatus(ride.status, "arrived")) {
    return { ok: false, error: "No se puede marcar llegada ahora", code: "invalid_state" };
  }

  const updated = await updateRideStatus(supabase, ride.id, "accepted", { status: "arrived" });
  if (!updated) return { ok: false, error: "No se pudo marcar llegada" };

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.driverUserId,
    eventType: "driver_arrived",
    fromStatus: "accepted",
    toStatus: "arrived",
  });

  void emitRidePhaseNotifications(supabase, {
    ride: updated,
    phase: "arrived",
    driverUserId: args.driverUserId,
  });

  return { ok: true, ride: updated };
}

export async function startTrip(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; ticketCode: string; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
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
  const updated = await updateRideStatus(supabase, ride.id, "arrived", {
    status: "in_trip",
    trip_started_at: now,
  });
  if (!updated) return { ok: false, error: "No se pudo iniciar el viaje" };

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.driverUserId,
    eventType: "trip_started",
    fromStatus: "arrived",
    toStatus: "in_trip",
    meta: { ticket_verified: true },
  });

  void emitRidePhaseNotifications(supabase, {
    ride: updated,
    phase: "in_trip",
    driverUserId: args.driverUserId,
  });

  return { ok: true, ride: updated };
}

export async function completeTrip(
  supabase: SupabaseClient,
  args: { rideId: string; driverUserId: string; finalTotalMxnCents?: number; authPhone?: string | null }
): Promise<TripResult> {
  const ride = await getRideById(supabase, args.rideId);
  if (!ride) return { ok: false, error: "Viaje no encontrado" };
  const accountOpts = { authPhone: args.authPhone };
  if (!(await userIsDriverForRide(supabase, args.driverUserId, ride, accountOpts))) {
    return { ok: false, error: "No autorizado", code: "forbidden" };
  }
  if (!canTransitionRideStatus(ride.status, "completed")) {
    return { ok: false, error: "No se puede completar el viaje ahora", code: "invalid_state" };
  }
  if (!ride.driver_id) return { ok: false, error: "Sin conductor asignado" };

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

  const { data: updated, error } = await supabase
    .from("ride_bookings")
    .update({
      status: "completed",
      final_total_mxn_cents: finalTotal,
      commission_mxn_cents: commission,
      trip_ended_at: now,
      updated_at: now,
    })
    .eq("id", ride.id)
    .eq("status", "in_trip")
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    console.error("[ride-trip] complete update", error);
    return { ok: false, error: "No se pudo completar el viaje" };
  }

  await appendRideEvent(supabase, {
    rideId: ride.id,
    actorId: args.driverUserId,
    eventType: "trip_completed",
    fromStatus: "in_trip",
    toStatus: "completed",
    meta: { final_total_mxn_cents: finalTotal, commission_mxn_cents: commission, driver_payout: driverPay },
  });

  const completed = updated as RideBookingRow;
  void emitRidePhaseNotifications(supabase, {
    ride: completed,
    phase: "completed",
    driverUserId: driverId,
    finalTotalMxnCents: finalTotal,
    driverPayoutMxnCents: driverPay,
  });

  return { ok: true, ride: completed };
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

export async function listActiveTripsForBuyer(
  supabase: SupabaseClient,
  buyerUserId: string,
  options?: RideAccountOptions,
): Promise<RideBookingRow[]> {
  const pool = await expandUserAccountIdPool(supabase, buyerUserId, options);
  if (pool.length === 0) return [];

  const buyerPool = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  const statuses = ["requested", "matched", "accepted", "arrived", "in_trip"] as const;

  const { data, error } = await supabase
    .from("ride_bookings")
    .select("*")
    .in("buyer_id", buyerPool)
    .in("status", [...statuses])
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[ride-trip] listActiveTripsForBuyer", error);
  }

  let rows = ((data ?? []) as RideBookingRow[]).filter((r) => tripMatchesBuyerPool(r, pool));

  if (rows.length === 0) {
    const { data: recent, error: recentErr } = await supabase
      .from("ride_bookings")
      .select("*")
      .in("status", [...statuses])
      .order("created_at", { ascending: false })
      .limit(40);

    if (recentErr) {
      console.error("[ride-trip] listActiveTripsForBuyer fallback", recentErr);
    } else {
      rows = (recent ?? []).filter((r) => tripMatchesBuyerPool(r as RideBookingRow, pool));
    }
  }

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows.slice(0, 5);
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
    return [...active].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
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
