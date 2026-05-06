/**
 * Whether a new Stripe checkout for the same listing+buyer should be blocked.
 * - Package listings: one platform fee covers the plan — any existing paid row blocks another checkout.
 * - Single-session listings: only non-terminal paid bookings block (scheduled, in progress, etc.);
 *   completed or cancelled allows paying again for a new visit.
 */
export function checkoutBlockedByExistingPaidRows(
  paidRows: { status: string | null }[] | null | undefined,
  hasPackageListing: boolean
): boolean {
  const rows = paidRows ?? [];
  if (rows.length === 0) return false;
  if (hasPackageListing) return true;
  return rows.some((r) => {
    const s = String(r.status ?? "");
    return s !== "completed" && s !== "cancelled";
  });
}
