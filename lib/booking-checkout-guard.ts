/**
 * Whether a new Stripe checkout for the same listing+buyer should be blocked.
 * - One active (non-terminal) paid row blocks another checkout: package or single-visit.
 * - When every paid row is completed or cancelled, checkout is allowed again (next plan / next visit).
 */
export function checkoutBlockedByExistingPaidRows(
  paidRows: { status: string | null }[] | null | undefined
): boolean {
  const rows = paidRows ?? [];
  if (rows.length === 0) return false;
  return rows.some((r) => {
    const s = String(r.status ?? "");
    return s !== "completed" && s !== "cancelled";
  });
}
