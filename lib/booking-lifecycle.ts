import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type BookingLifecycleStatus =
  | "pending"
  | "confirmed"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Allowed transitions (seller-driven ops); buyer cancellation can be added later. */
const ALLOWED: Record<string, Set<string>> = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["scheduled", "in_progress", "completed", "cancelled"]),
  scheduled: new Set(["in_progress", "completed", "cancelled"]),
  in_progress: new Set(["completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
};

export function canTransitionLifecycle(from: string | null | undefined, to: BookingLifecycleStatus): boolean {
  const f = (from ?? "pending") as BookingLifecycleStatus;
  return ALLOWED[f]?.has(to) ?? false;
}

/**
 * When Stripe first marks a booking paid, we normally set `confirmed`. If the row already moved
 * along the seller lifecycle (or was completed), never downgrade — fixes rare replays / delayed
 * webhooks / bad rows that still had payment_status pending.
 */
export function statusAfterPaymentSucceeded(currentStatus: string | null | undefined): BookingLifecycleStatus {
  const s = String(currentStatus ?? "pending");
  if (s === "scheduled" || s === "in_progress" || s === "completed" || s === "cancelled") {
    return s as BookingLifecycleStatus;
  }
  return "confirmed";
}

export function generateTicketCodeCandidate(): string {
  return `NG-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Ensures a paid booking has a unique ticket_code (idempotent). Call after payment succeeds.
 */
export async function ensureTicketCodeForPaidBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<string | null> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return null;

  const { data: row } = await supabase
    .from("service_bookings")
    .select("ticket_code,payment_status")
    .in("id", idVars)
    .maybeSingle();

  if (!row || row.payment_status !== "paid") return null;
  if (row.ticket_code) return row.ticket_code;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateTicketCodeCandidate();
    const { data: updated, error } = await supabase
      .from("service_bookings")
      .update({ ticket_code: code, updated_at: new Date().toISOString() })
      .in("id", idVars)
      .eq("payment_status", "paid")
      .is("ticket_code", null)
      .select("ticket_code")
      .maybeSingle();

    if (!error && updated?.ticket_code) return updated.ticket_code;
    const { data: again } = await supabase.from("service_bookings").select("ticket_code").in("id", idVars).maybeSingle();
    if (again?.ticket_code) return again.ticket_code;
  }

  console.error("[booking-lifecycle] failed to assign ticket_code", { bookingId });
  return null;
}

export async function appendBookingEvent(
  supabase: SupabaseClient,
  opts: {
    bookingId: string;
    actorId: string | null;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("booking_events").insert({
    booking_id: opts.bookingId,
    actor_id: opts.actorId,
    event_type: opts.eventType,
    from_status: opts.fromStatus ?? null,
    to_status: opts.toStatus ?? null,
    meta: opts.meta ?? {},
  });
  if (error) console.error("[booking-events] insert", error);
}

/** Returns true if we already logged a buyer WhatsApp for this phase (dedupe). */
export async function hasBuyerPhaseNotify(
  supabase: SupabaseClient,
  bookingId: string,
  phase: string
): Promise<boolean> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return false;

  const { count, error } = await supabase
    .from("booking_events")
    .select("id", { count: "exact", head: true })
    .in("booking_id", idVars)
    .eq("event_type", "buyer_whatsapp_phase")
    .eq("to_status", phase);

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function recordBuyerPhaseNotify(
  supabase: SupabaseClient,
  bookingId: string,
  phase: string
): Promise<void> {
  await appendBookingEvent(supabase, {
    bookingId,
    actorId: null,
    eventType: "buyer_whatsapp_phase",
    toStatus: phase,
    meta: { channel: "whatsapp" },
  });
}

/** Returns true if we already logged a provider WhatsApp for this lifecycle phase (dedupe). */
export async function hasSellerPhaseNotify(
  supabase: SupabaseClient,
  bookingId: string,
  phase: string,
): Promise<boolean> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return false;

  const { count, error } = await supabase
    .from("booking_events")
    .select("id", { count: "exact", head: true })
    .in("booking_id", idVars)
    .eq("event_type", "seller_whatsapp_phase")
    .eq("to_status", phase);

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function recordSellerPhaseNotify(
  supabase: SupabaseClient,
  bookingId: string,
  phase: string,
): Promise<void> {
  await appendBookingEvent(supabase, {
    bookingId,
    actorId: null,
    eventType: "seller_whatsapp_phase",
    toStatus: phase,
    meta: { channel: "whatsapp" },
  });
}
