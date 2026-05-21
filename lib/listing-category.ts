import { isRidesEnabled } from "@/lib/rides/flags";

/** Normalize listing category for service checks (DB may use category_id or legacy category, mixed case). */
export function isServicesListing(listing: {
  category_id?: string | null;
  category?: string | null;
} | null): boolean {
  if (!listing) return false;
  const raw = listing.category_id ?? listing.category ?? "";
  return String(raw).trim().toLowerCase() === "services";
}

/** Ride/taxi driver listing — only true when RIDES_ENABLED and subcategory_kind = 'ride'. */
export function isRideListing(
  listing: { subcategory_kind?: string | null } | null,
): boolean {
  if (!isRidesEnabled() || !listing) return false;
  return String(listing.subcategory_kind ?? "").trim().toLowerCase() === "ride";
}
