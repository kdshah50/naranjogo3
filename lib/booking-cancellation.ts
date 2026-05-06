import type { BookingLifecycleStatus } from "@/lib/booking-lifecycle";

export const BUYER_CANCEL_CODES = [
  "schedule_conflict",
  "changed_mind",
  "found_other_provider",
  "other",
] as const;

export const SELLER_CANCEL_CODES = [
  "seller_unavailable",
  "mutual_agreement",
  "buyer_no_show",
  "other",
] as const;

export type BuyerCancelReasonCode = (typeof BUYER_CANCEL_CODES)[number];
export type SellerCancelReasonCode = (typeof SELLER_CANCEL_CODES)[number];

export function normalizeCancelNote(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, 500);
  return s.length > 0 ? s : null;
}

export function parseCancelReasonCode(
  raw: unknown,
  role: "buyer" | "seller"
): BuyerCancelReasonCode | SellerCancelReasonCode | null {
  const code = String(raw ?? "").trim().toLowerCase();
  if (!code) return null;
  if (role === "buyer") {
    return (BUYER_CANCEL_CODES as readonly string[]).includes(code) ? (code as BuyerCancelReasonCode) : null;
  }
  return (SELLER_CANCEL_CODES as readonly string[]).includes(code) ? (code as SellerCancelReasonCode) : null;
}

/** Buyer may cancel before the visit is marked in progress (policy v1). */
export function canBuyerCancelBooking(status: string): boolean {
  const s = status.toLowerCase();
  return s === "pending" || s === "confirmed" || s === "scheduled";
}

/** Seller may cancel until the job is completed. */
export function canSellerCancelBooking(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s === "pending" ||
    s === "confirmed" ||
    s === "scheduled" ||
    s === "in_progress"
  );
}

export function canTransitionToCancelled(from: string | null | undefined): boolean {
  const f = (from ?? "pending") as BookingLifecycleStatus;
  if (f === "completed" || f === "cancelled") return false;
  return (
    f === "pending" ||
    f === "confirmed" ||
    f === "scheduled" ||
    f === "in_progress"
  );
}
