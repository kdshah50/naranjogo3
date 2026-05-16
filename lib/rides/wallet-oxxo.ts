import "server-only";
import { getStripe } from "@/lib/stripe";

/**
 * Wallet top-up via Stripe Checkout (OXXO + card).
 *
 * Creates a Stripe Checkout Session in MXN that the buyer pays at any OXXO
 * store (cash voucher) or with a card. When Stripe confirms the payment,
 * our webhook (added in Step 7) credits the buyer's wallet ledger.
 *
 * The Session is tagged with metadata.purpose='wallet_topup' so the existing
 * Stripe webhook handler can distinguish it from service-booking checkouts
 * without ambiguity.
 *
 * See: docs/RIDES_AI_PLAN.md §9 (Wallet + OXXO funding).
 */

/** Minimum top-up: 50 MXN. Below this, OXXO trip isn't worth the user's time. */
export const MIN_TOPUP_MXN_CENTS = 5_000;
/** Maximum per-session top-up: 5,000 MXN (raise later as needed). */
export const MAX_TOPUP_MXN_CENTS = 500_000;

export type CreateWalletTopupArgs = {
  userId: string;
  amountMxnCents: number;
  successUrl: string;
  cancelUrl: string;
};

export type CreateWalletTopupResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; status: number; error: string };

export async function createWalletTopupCheckoutSession(
  args: CreateWalletTopupArgs
): Promise<CreateWalletTopupResult> {
  const userId = String(args.userId ?? "").trim();
  const amount = Math.round(Number(args.amountMxnCents));

  if (!userId) {
    return { ok: false, status: 400, error: "userId requerido" };
  }
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_MXN_CENTS) {
    return {
      ok: false,
      status: 400,
      error: `Monto mínimo de carga: $${MIN_TOPUP_MXN_CENTS / 100} MXN`,
    };
  }
  if (amount > MAX_TOPUP_MXN_CENTS) {
    return {
      ok: false,
      status: 400,
      error: `Monto máximo por carga: $${MAX_TOPUP_MXN_CENTS / 100} MXN`,
    };
  }

  const stripe = getStripe();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["oxxo", "card"],
      currency: "mxn",
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: "Carga de Saldo Naranjo",
              description:
                "Saldo prepagado para usar en NaranjoGo. No reembolsable salvo política aplicable.",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      payment_method_options: {
        oxxo: { expires_after_days: 3 },
      },
      // Metadata is duplicated on both the Session and PaymentIntent because
      // Stripe events vary in which object they expand — webhook can read it
      // from either path.
      payment_intent_data: {
        metadata: {
          purpose: "wallet_topup",
          user_id: userId,
          amount_mxn_cents: String(amount),
        },
      },
      metadata: {
        purpose: "wallet_topup",
        user_id: userId,
        amount_mxn_cents: String(amount),
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });

    if (!session.url) {
      return { ok: false, status: 500, error: "Stripe no devolvió URL de pago" };
    }

    return { ok: true, url: session.url, sessionId: session.id };
  } catch (e) {
    console.error("[wallet-oxxo] create session", e);
    return { ok: false, status: 500, error: "No se pudo crear sesión de pago" };
  }
}
