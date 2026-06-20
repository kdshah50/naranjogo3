import type { RideBookingStatus } from "@/lib/rides/ride-bookings-server";

/** Platform take rate in basis points (1000 = 10%). */
export const RIDES_COMMISSION_BPS = 1000;

/** Free cancel window after match (ms). */
export const RIDE_CANCEL_FREE_MS = 2 * 60 * 1000;

/** Cancel fee after free window (centavos). */
export const RIDE_CANCEL_FEE_MXN_CENTS = 3000;

const ALLOWED: Record<RideBookingStatus, Set<RideBookingStatus>> = {
  requested: new Set(["matched", "cancelled"]),
  matched: new Set(["accepted", "cancelled"]),
  accepted: new Set(["arrived", "cancelled"]),
  arrived: new Set(["in_trip", "cancelled"]),
  in_trip: new Set(["completed", "cancelled"]),
  completed: new Set(["disputed"]),
  cancelled: new Set(),
  disputed: new Set(),
};

export function canTransitionRideStatus(
  from: string | null | undefined,
  to: RideBookingStatus
): boolean {
  const f = (from ?? "requested") as RideBookingStatus;
  return ALLOWED[f]?.has(to) ?? false;
}

export function computeCommissionMxnCents(fareMxnCents: number): number {
  const fare = Math.round(Number(fareMxnCents));
  if (!Number.isFinite(fare) || fare <= 0) return 0;
  return Math.round((fare * RIDES_COMMISSION_BPS) / 10_000);
}

export function driverPayoutMxnCents(fareMxnCents: number): number {
  const fare = Math.round(Number(fareMxnCents));
  return Math.max(0, fare - computeCommissionMxnCents(fare));
}

export function cancelFeeApplies(matchedAt: string | null | undefined, now = Date.now()): boolean {
  if (!matchedAt) return false;
  const t = Date.parse(matchedAt);
  if (!Number.isFinite(t)) return false;
  return now - t > RIDE_CANCEL_FREE_MS;
}
