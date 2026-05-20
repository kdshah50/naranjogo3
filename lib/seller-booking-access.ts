import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type SellerBookingAccessRow = {
  seller_id?: string | null;
  listing_id?: string | null;
};

/**
 * True when the logged-in seller pool may view or manage a paid booking row:
 * `service_bookings.seller_id` matches, or the seller owns the listing (fixes drifted seller_id).
 */
export async function sellerCanManagePaidBookingRow(
  supabase: SupabaseClient,
  sellerPoolVariants: string[],
  row: SellerBookingAccessRow
): Promise<boolean> {
  const sellerIdStr = String(row.seller_id ?? "");
  const sidVars = idMatchVariantsForIn(sellerIdStr);
  if (sidVars.some((v) => sellerPoolVariants.includes(v))) return true;

  const listVars = idMatchVariantsForIn(String(row.listing_id ?? ""));
  if (listVars.length === 0) return false;
  const { data: listingRows } = await supabase.from("listings").select("seller_id").in("id", listVars).limit(1);
  const ls = listingRows?.[0]?.seller_id != null ? String(listingRows[0].seller_id) : "";
  if (!ls) return false;
  return idMatchVariantsForIn(ls).some((v) => sellerPoolVariants.includes(v));
}
