import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { idMatchVariantsForIn } from "@/lib/auth-server";

/** Mark balance or tip paid from a Stripe Checkout session (webhook fallback). */
export async function syncHousekeepingSupplementFromCheckoutSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; kind?: "balance" | "tip"; bookingId?: string; alreadyPaid?: boolean }> {
  const paymentKind = String(session.metadata?.payment_kind ?? "").trim().toLowerCase();
  if (paymentKind !== "balance" && paymentKind !== "tip") {
    return { ok: false };
  }

  const bookingIdMeta = session.metadata?.booking_id?.trim() ?? "";
  if (!bookingIdMeta) return { ok: false };

  if (session.payment_status !== "paid") {
    return { ok: true, kind: paymentKind as "balance" | "tip", bookingId: bookingIdMeta };
  }

  const idVars = idMatchVariantsForIn(bookingIdMeta);
  const now = new Date().toISOString();

  if (paymentKind === "balance") {
    const { data: updated } = await supabase
      .from("service_bookings")
      .update({
        balance_payment_status: "paid",
        balance_paid_at: now,
        updated_at: now,
      })
      .in("id", idVars)
      .eq("balance_payment_status", "pending")
      .select("id");

    if (updated?.length) {
      return { ok: true, kind: "balance", bookingId: bookingIdMeta };
    }

    const { data: cur } = await supabase
      .from("service_bookings")
      .select("balance_payment_status")
      .in("id", idVars)
      .maybeSingle();

    if (String(cur?.balance_payment_status ?? "") === "paid") {
      return { ok: true, kind: "balance", bookingId: bookingIdMeta, alreadyPaid: true };
    }
    return { ok: false, kind: "balance", bookingId: bookingIdMeta };
  }

  const tipCents = Math.round(Number(session.metadata?.tip_mxn_cents ?? session.amount_total ?? 0));
  const { data: updated } = await supabase
    .from("service_bookings")
    .update({
      tip_payment_status: "paid",
      tip_paid_at: now,
      tip_mxn_cents: tipCents > 0 ? tipCents : undefined,
      updated_at: now,
    })
    .in("id", idVars)
    .in("tip_payment_status", ["pending", "none"])
    .select("id");

  if (updated?.length) {
    return { ok: true, kind: "tip", bookingId: bookingIdMeta };
  }

  const { data: cur } = await supabase
    .from("service_bookings")
    .select("tip_payment_status")
    .in("id", idVars)
    .maybeSingle();

  if (String(cur?.tip_payment_status ?? "") === "paid") {
    return { ok: true, kind: "tip", bookingId: bookingIdMeta, alreadyPaid: true };
  }
  return { ok: false, kind: "tip", bookingId: bookingIdMeta };
}
