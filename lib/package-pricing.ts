/**
 * When admin sets a package (N sessions, total price), platform commission is
 * computed from the total package value, not the per-session list price.
 */
export function listingHasActivePackage(listing: {
  package_session_count?: number | null;
  package_total_price_mxn?: number | null;
}): boolean {
  const n = listing.package_session_count;
  const total = listing.package_total_price_mxn;
  return n != null && n >= 2 && total != null && total > 0;
}

/**
 * Centavos used as base for computeCommissionCents.
 */
export function effectiveListingPriceMxnCents(listing: {
  price_mxn: number;
  package_session_count?: number | null;
  package_total_price_mxn?: number | null;
}): number {
  if (listingHasActivePackage(listing)) {
    return Math.round(Number(listing.package_total_price_mxn) || 0);
  }
  return Math.round(Number(listing.price_mxn) || 0);
}

type ListingForPackageSavings = {
  price_mxn: number;
  package_session_count?: number | null;
  package_total_price_mxn?: number | null;
};

/** If list price × N > package total, return savings (centavos) and % vs paying N single visits. */
export function packageVsListSavings(listing: ListingForPackageSavings): {
  savingsCents: number;
  savingsPctApprox: number;
  listSumCents: number;
} | null {
  if (!listingHasActivePackage(listing)) return null;
  const n = Number(listing.package_session_count);
  const unit = Math.round(Number(listing.price_mxn) || 0);
  const pkg = Math.round(Number(listing.package_total_price_mxn) || 0);
  if (n < 2 || unit <= 0 || pkg <= 0) return null;
  const listSum = unit * n;
  const savingsCents = listSum - pkg;
  if (savingsCents <= 0) return null;
  const savingsPctApprox = Math.min(99, Math.round((savingsCents / listSum) * 100));
  return { savingsCents, savingsPctApprox, listSumCents: listSum };
}
