import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRideByIdFresh,
  type RideBookingRow,
} from "@/lib/rides/ride-bookings-server";
import { appendRideEvent } from "@/lib/rides/ride-bookings-server";
import {
  canAdvanceStatusCode,
  rideStatusToCode,
  type RideTransitionRule,
  type TransitionAudit,
} from "@/lib/rides/ride-status-codes";
import {
  emitRidePhaseNotifications,
  type RideNotifyPhase,
} from "@/lib/rides/ride-notify";

export type PhaseTransitionArgs = {
  ride: RideBookingRow;
  phase: RideNotifyPhase;
  driverUserId: string;
  actorId: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  eventMeta?: Record<string, unknown>;
  finalTotalMxnCents?: number;
  driverPayoutMxnCents?: number;
};

async function eventExistsForStep(
  supabase: SupabaseClient,
  rideId: string,
  eventType: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("ride_events")
    .select("id")
    .eq("ride_id", rideId)
    .eq("event_type", eventType)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Verify DB row is at least `toStatus` (uses fresh read + event hydration).
 * Rule R-DB: UI/sync/WhatsApp must not advance past confirmed DB truth.
 */
export async function verifyRideStatusCommitted(
  supabase: SupabaseClient,
  rideId: string,
  toStatus: string,
): Promise<RideBookingRow | null> {
  const targetCode = rideStatusToCode(toStatus);
  const fresh = await getRideByIdFresh(supabase, rideId, { attempts: 6, delayMs: 500 });
  if (!fresh) return null;
  if (rideStatusToCode(fresh.status) >= targetCode) return fresh;
  return null;
}

function buildAudit(
  args: PhaseTransitionArgs,
  opts: {
    dbCode: number | null;
    eventOk: boolean;
    notifyOk: boolean;
    passed: RideTransitionRule[];
    failed: RideTransitionRule[];
  },
): TransitionAudit {
  return {
    ride_id: args.ride.id,
    from_status: args.fromStatus,
    to_status: args.toStatus,
    from_code: rideStatusToCode(args.fromStatus),
    to_code: rideStatusToCode(args.toStatus),
    rules_passed: opts.passed,
    rules_failed: opts.failed,
    db_code: opts.dbCode,
    event_ok: opts.eventOk,
    notify_ok: opts.notifyOk,
  };
}

/**
 * Pipeline: DB already updated → append event (with status_code) → verify → notify.
 * Order: 1) event log  2) R-DB verify  3) R-NOTIFY WhatsApp with fresh link state
 */
export async function commitRidePhaseTransition(
  supabase: SupabaseClient,
  args: PhaseTransitionArgs,
): Promise<{ ok: true; ride: RideBookingRow; audit: TransitionAudit } | { ok: false; audit: TransitionAudit }> {
  const targetCode = rideStatusToCode(args.toStatus);
  const fromCode = rideStatusToCode(args.fromStatus);
  const passed: RideTransitionRule[] = [];
  const failed: RideTransitionRule[] = [];

  if (!canAdvanceStatusCode(fromCode, targetCode)) {
    failed.push("R-SEQ");
    return {
      ok: false,
      audit: buildAudit(args, {
        dbCode: fromCode,
        eventOk: false,
        notifyOk: false,
        passed,
        failed,
      }),
    };
  }
  passed.push("R-SEQ");

  await appendRideEvent(supabase, {
    rideId: args.ride.id,
    actorId: args.actorId,
    eventType: args.eventType,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    meta: {
      status_code: targetCode,
      from_code: fromCode,
      ...args.eventMeta,
    },
  });

  const eventOk = await eventExistsForStep(supabase, args.ride.id, args.eventType);
  if (eventOk) passed.push("R-EVT");
  else failed.push("R-EVT");

  const verified = await verifyRideStatusCommitted(supabase, args.ride.id, args.toStatus);
  const dbCode = verified ? rideStatusToCode(verified.status) : null;
  if (verified && dbCode !== null && dbCode >= targetCode) passed.push("R-DB");
  else failed.push("R-DB");

  // Notify buyer + driver even when replica verify lags — POST already committed the row.
  const notifyRow =
    verified ??
    (rideStatusToCode(args.ride.status) >= targetCode ? args.ride : null);

  let notifyOk = false;
  if (notifyRow && eventOk) {
    await emitRidePhaseNotifications(supabase, {
      ride: notifyRow,
      phase: args.phase,
      driverUserId: args.driverUserId,
      finalTotalMxnCents: args.finalTotalMxnCents,
      driverPayoutMxnCents: args.driverPayoutMxnCents,
    });
    notifyOk = true;
    passed.push("R-NOTIFY");
  } else {
    failed.push("R-NOTIFY");
    console.warn("[ride-transition-pipeline] notify skipped — rules failed", {
      rideId: args.ride.id.slice(0, 8),
      phase: args.phase,
      failed,
    });
  }

  const audit = buildAudit(args, { dbCode, eventOk, notifyOk, passed, failed });
  const resultRow = verified ?? notifyRow;
  if (!resultRow) return { ok: false, audit };
  return { ok: true, ride: resultRow, audit };
}

/** Attach status_code for sync API / UI monitoring. */
export function withStatusCode<T extends { status: string }>(
  row: T,
): T & { status_code: number } {
  return { ...row, status_code: rideStatusToCode(row.status) };
}
