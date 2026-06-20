export type RideBookingStatus =
  | "requested"
  | "matched"
  | "accepted"
  | "arrived"
  | "in_trip"
  | "completed"
  | "cancelled"
  | "disputed";

/**
 * Serialized ride lifecycle codes (Uber-style monotonic steps).
 * UI, sync API, and WhatsApp all use the same numbers — never go backward.
 */
export const RIDE_STATUS_CODE = {
  cancelled: 5,
  requested: 10,
  matched: 20,
  accepted: 30,
  arrived: 40,
  in_trip: 50,
  completed: 60,
  disputed: 70,
} as const satisfies Record<RideBookingStatus, number>;

export type RideStatusCode = (typeof RIDE_STATUS_CODE)[RideBookingStatus];

const STATUS_BY_CODE = Object.fromEntries(
  Object.entries(RIDE_STATUS_CODE).map(([status, code]) => [code, status]),
) as Record<number, RideBookingStatus>;

export function rideStatusToCode(status: string | null | undefined): number {
  const key = String(status ?? "").trim() as RideBookingStatus;
  return RIDE_STATUS_CODE[key] ?? 0;
}

export function rideCodeToStatus(code: number): RideBookingStatus | null {
  return STATUS_BY_CODE[code] ?? null;
}

/** Monotonic rank — same ordering as legacy rideStatusRank. */
export function rideStatusCodeRank(code: number): number {
  if (code === RIDE_STATUS_CODE.cancelled) return -1;
  return code;
}

export function canAdvanceStatusCode(fromCode: number, toCode: number): boolean {
  if (toCode === RIDE_STATUS_CODE.cancelled) {
    return fromCode >= RIDE_STATUS_CODE.matched && fromCode < RIDE_STATUS_CODE.completed;
  }
  return toCode > fromCode;
}

export type RideTransitionRule =
  | "R-SEQ" /** target code > current code */
  | "R-DB" /** ride_bookings row confirms status after write */
  | "R-EVT" /** ride_events row exists for this step */
  | "R-NOTIFY"; /** WhatsApp sent only after R-DB + R-EVT */

export type TransitionAudit = {
  ride_id: string;
  from_status: string;
  to_status: string;
  from_code: number;
  to_code: number;
  rules_passed: RideTransitionRule[];
  rules_failed: RideTransitionRule[];
  db_code: number | null;
  event_ok: boolean;
  notify_ok: boolean;
};
