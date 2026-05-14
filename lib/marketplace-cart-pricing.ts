import { DEFAULT_COMMISSION_PCT, MIN_COMMISSION_CENTS_MXN } from "@/lib/stripe";

export type CartLineInput = {
  listingId: string;
  qty: number;
  unitPriceMxnCents: number;
  commissionPct: number | null | undefined;
  titleEs: string;
};

export type CartLineBreakdown = CartLineInput & {
  lineSubtotalCents: number;
  lineCommissionCents: number;
};

export type CartPricingBreakdown = {
  lines: CartLineBreakdown[];
  subtotalCents: number;
  commissionCents: number;
  vatCents: number;
  totalCents: number;
  vatPercent: number;
};

/** IVA / VAT shown on checkout (Mexico default 16). Override with MARKETPLACE_VAT_PERCENT. */
export function getMarketplaceVatPercent(): number {
  const raw = process.env.MARKETPLACE_VAT_PERCENT ?? process.env.MARKETPLACE_VAT_PCT ?? "16";
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0 || n > 30) return 16;
  return n;
}

/**
 * Commission per line (listing commission_pct from admin), then one platform minimum on the sum.
 * VAT = vatPercent% of (subtotal + commission), all in centavos.
 */
export function computeCartPricing(lines: CartLineInput[]): CartPricingBreakdown {
  const vatPercent = getMarketplaceVatPercent();
  const breakdownLines: CartLineBreakdown[] = [];
  let subtotalCents = 0;
  let rawCommissionSum = 0;

  for (const line of lines) {
    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const unit = Math.max(0, Math.round(Number(line.unitPriceMxnCents) || 0));
    const lineSubtotalCents = unit * qty;
    const pct = line.commissionPct ?? DEFAULT_COMMISSION_PCT;
    const lineCommissionCents = Math.round((lineSubtotalCents * (Number.isFinite(Number(pct)) ? Number(pct) : DEFAULT_COMMISSION_PCT)) / 100);
    subtotalCents += lineSubtotalCents;
    rawCommissionSum += lineCommissionCents;
    breakdownLines.push({
      ...line,
      qty,
      lineSubtotalCents,
      lineCommissionCents,
    });
  }

  const commissionCents = Math.max(rawCommissionSum, subtotalCents > 0 ? MIN_COMMISSION_CENTS_MXN : 0);

  const taxableCents = subtotalCents + commissionCents;
  const vatCents = Math.round((taxableCents * vatPercent) / 100);
  const totalCents = subtotalCents + commissionCents + vatCents;

  return {
    lines: breakdownLines,
    subtotalCents,
    commissionCents,
    vatCents,
    totalCents,
    vatPercent,
  };
}

/** application_fee_amount for Stripe Connect = platform keeps commission + IVA shown to buyer. */
export function marketplaceApplicationFeeCents(pricing: CartPricingBreakdown): number {
  return pricing.commissionCents + pricing.vatCents;
}

/** Reduce platform commission by loyalty %, floor at MIN_COMMISSION; recompute IVA and total. */
export function applyLoyaltyDiscountToCartPricing(
  pricing: CartPricingBreakdown,
  discountPct: number
): CartPricingBreakdown {
  if (!Number.isFinite(discountPct) || discountPct <= 0) return pricing;
  if (pricing.subtotalCents <= 0) return pricing;
  const rawDisc = Math.round((pricing.commissionCents * discountPct) / 100);
  const newCommission = Math.max(pricing.commissionCents - rawDisc, MIN_COMMISSION_CENTS_MXN);
  const taxableCents = pricing.subtotalCents + newCommission;
  const vatCents = Math.round((taxableCents * pricing.vatPercent) / 100);
  const totalCents = pricing.subtotalCents + newCommission + vatCents;
  return {
    ...pricing,
    commissionCents: newCommission,
    vatCents,
    totalCents,
  };
}
