import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";

export type StripeConnectStatus = {
  linked: boolean;
  accountId: string | null;
  payoutReady: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  transfersCapability: string | null;
  requirementsCurrentlyDue: string[];
};

export function stripeConnectStatusFromAccount(account: Stripe.Account): StripeConnectStatus {
  const accountId = account.id?.startsWith("acct_") ? account.id : null;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  const transfersCapability = account.capabilities?.transfers ?? null;
  const transfersActive = transfersCapability === "active";
  const payoutReady = Boolean(
    accountId && chargesEnabled && detailsSubmitted && (transfersActive || payoutsEnabled),
  );
  const requirementsCurrentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements.currently_due.filter((x): x is string => typeof x === "string")
    : [];

  return {
    linked: Boolean(accountId),
    accountId,
    payoutReady,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    transfersCapability,
    requirementsCurrentlyDue,
  };
}

export async function fetchStripeConnectStatus(accountId: string): Promise<StripeConnectStatus> {
  if (!accountId.startsWith("acct_")) {
    return {
      linked: false,
      accountId: null,
      payoutReady: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      transfersCapability: null,
      requirementsCurrentlyDue: [],
    };
  }
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return stripeConnectStatusFromAccount(account);
}

/** DB has acct_ id AND Stripe reports the account can receive destination charges. */
export async function sellerConnectPayoutReady(
  supabase: SupabaseClient,
  sellerId: string,
): Promise<StripeConnectStatus> {
  const accountId = await loadSellerConnectId(supabase, sellerId);
  if (!accountId) {
    return {
      linked: false,
      accountId: null,
      payoutReady: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      transfersCapability: null,
      requirementsCurrentlyDue: [],
    };
  }
  return fetchStripeConnectStatus(accountId);
}

export function connectNotReadyMessage(status: StripeConnectStatus, lang: "es" | "en"): string {
  if (!status.linked) {
    return lang === "en"
      ? "The provider has not started Stripe Connect onboarding yet."
      : "El proveedor aún no inició Stripe Connect.";
  }
  if (!status.detailsSubmitted) {
    return lang === "en"
      ? "The provider started Stripe but has not finished onboarding — ask them to complete Profile → Stripe."
      : "El proveedor inició Stripe pero no terminó el registro — pídele que complete Mi perfil → Stripe.";
  }
  if (!status.chargesEnabled || status.transfersCapability !== "active") {
    return lang === "en"
      ? "Stripe is still verifying the provider account (charges/transfers not active yet)."
      : "Stripe aún verifica la cuenta del proveedor (cobros/transferencias no activos).";
  }
  return lang === "en"
    ? "The provider must finish Stripe Connect before in-app balance pay works."
    : "El proveedor debe terminar Stripe Connect antes de pagar el saldo en la app.";
}
