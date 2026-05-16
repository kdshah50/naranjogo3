import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripePaymentIntentId } from "@/lib/stripe";
import { creditWallet } from "@/lib/rides/wallet-server";

/**
 * Stripe webhook handler for wallet top-up sessions.
 *
 * Triggered for two event types:
 *   - `checkout.session.completed` — fires for CARD top-ups as soon as the
 *     charge succeeds (and for OXXO when the voucher is generated, but with
 *     payment_status='unpaid'; we ignore those here).
 *   - `checkout.session.async_payment_succeeded` — fires for OXXO once the
 *     customer actually pays cash at the store (payment_status='paid').
 *
 * Idempotency is guaranteed by `creditWallet()` via a unique constraint on
 * (kind='load', stripe_pi_id). Replays return `alreadyApplied: true` and are
 * a safe no-op.
 *
 * See: docs/RIDES_AI_PLAN.md §9 (Wallet + OXXO).
 */

export type WalletTopupSession = {
  metadata?: Record<string, string | undefined> | null;
  payment_intent?: string | { id: string } | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  id?: string | null;
};

export type WalletTopupWebhookResult =
  | { ok: true; credited: boolean; reason?: string }
  | { ok: false; error: string };

export async function handleWalletTopupSessionCompleted(
  supabase: SupabaseClient,
  args: { eventType: string; session: WalletTopupSession }
): Promise<WalletTopupWebhookResult> {
  const { eventType, session } = args;

  if (session?.metadata?.purpose !== "wallet_topup") {
    return { ok: true, credited: false, reason: "not a wallet_topup session" };
  }

  // For `checkout.session.completed`, only credit when payment_status === 'paid'.
  // OXXO sessions arrive here with payment_status === 'unpaid' (voucher created,
  // money not yet paid) — those are credited later via `async_payment_succeeded`.
  if (
    eventType === "checkout.session.completed" &&
    session.payment_status !== "paid"
  ) {
    return { ok: true, credited: false, reason: "voucher_pending" };
  }

  const userId = String(session.metadata?.user_id ?? "").trim();
  if (!userId) {
    return { ok: false, error: "wallet_topup: missing metadata.user_id" };
  }

  const amountFromMetadata = Number(session.metadata?.amount_mxn_cents ?? NaN);
  const amountFromSession = Number(session.amount_total ?? NaN);

  // Prefer session.amount_total (authoritative — what Stripe actually charged)
  // over metadata (which we set client-side; could in theory be tampered with).
  const amount = Number.isFinite(amountFromSession) && amountFromSession > 0
    ? amountFromSession
    : amountFromMetadata;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "wallet_topup: invalid amount" };
  }

  // Sanity: only MXN top-ups credit MXN wallet.
  const currency = String(session.currency ?? "mxn").toLowerCase();
  if (currency !== "mxn") {
    return { ok: false, error: `wallet_topup: unexpected currency ${currency}` };
  }

  const piId = stripePaymentIntentId(session.payment_intent ?? null);
  if (!piId) {
    return { ok: false, error: "wallet_topup: missing payment_intent" };
  }

  const result = await creditWallet(supabase, {
    userId,
    amountMxnCents: amount,
    kind: "load",
    stripePaymentIntentId: piId,
    meta: {
      source: "stripe_checkout",
      stripe_session_id: session.id ?? null,
      stripe_event_type: eventType,
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, credited: !result.alreadyApplied };
}
