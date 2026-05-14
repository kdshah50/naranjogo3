import {
  effectiveListingPriceMxnCents,
} from "@/lib/package-pricing";

/** Sanity cap: 500,000 MXN per agreed job base (centavos). */
export const MAX_SERVICE_PRICING_BASE_MXN_CENTS = 50_000_000;

export type AgreedGateRow = {
  agreed_subtotal_mxn_cents: number | null;
  seller_set_agreed_price_at: string | null;
};

/**
 * Listing/package reference subtotal in centavos + optional seller-agreed override from contact gate.
 */
export function resolveServicePricingBaseMxnCents(args: {
  listing: {
    price_mxn: number;
    package_session_count?: number | null;
    package_total_price_mxn?: number | null;
  };
  gate: AgreedGateRow | null | undefined;
}): number {
  const listingBase = effectiveListingPriceMxnCents(args.listing);
  const agreed = args.gate?.agreed_subtotal_mxn_cents;
  const agreedAt = args.gate?.seller_set_agreed_price_at;
  if (
    agreed != null &&
    agreedAt != null &&
    Number.isFinite(Number(agreed)) &&
    Number(agreed) >= 100 &&
    Number(agreed) <= MAX_SERVICE_PRICING_BASE_MXN_CENTS
  ) {
    return Math.round(Number(agreed));
  }
  return Math.max(0, Math.round(listingBase));
}
