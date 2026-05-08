import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export type SellerPlatformJobStats = {
  /** Paid bookings marked completed (all seller listings). */
  sellerCompletedPaid: number;
  /** Paid platform bookings for this listing marked completed. */
  listingCompletedPaid: number;
  /** Any paid booking on platform for seller (completed + confirmed + cancelled). */
  sellerPaidBookings: number;
};

/** Seller-wide counts for `/seller-bookings`: same visibility as merged list (seller_id pool OR listing you own). */
export async function getSellerAccountBookingCounts(
  supabase: SupabaseClient,
  sellerIdVariants: string[],
  listingIdVariants: string[],
): Promise<{ sellerCompletedPaid: number; sellerPaidBookings: number }> {
  const hasSeller = sellerIdVariants.length > 0;
  const hasList = listingIdVariants.length > 0;
  if (!hasSeller && !hasList) {
    return { sellerCompletedPaid: 0, sellerPaidBookings: 0 };
  }

  const scopedPaid = () => {
    let q = supabase.from("service_bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid");
    if (hasSeller && hasList) {
      q = q.or(`seller_id.in.(${sellerIdVariants.join(",")}),listing_id.in.(${listingIdVariants.join(",")})`);
    } else if (hasSeller) {
      q = q.in("seller_id", sellerIdVariants);
    } else {
      q = q.in("listing_id", listingIdVariants);
    }
    return q;
  };

  const { count: sellerCompleted } = await scopedPaid().eq("status", "completed");
  const { count: sellerPaid } = await scopedPaid();

  return {
    sellerCompletedPaid: sellerCompleted ?? 0,
    sellerPaidBookings: sellerPaid ?? 0,
  };
}

/**
 * Counts from service_bookings for trust UI ("completed via platform").
 */
export async function getSellerPlatformJobStats(
  supabase: SupabaseClient,
  sellerId: string,
  listingId: string,
): Promise<SellerPlatformJobStats> {
  const sellerVars = idMatchVariantsForIn(String(sellerId));
  const listingVars = idMatchVariantsForIn(String(listingId));
  if (sellerVars.length === 0 || listingVars.length === 0) {
    return { sellerCompletedPaid: 0, listingCompletedPaid: 0, sellerPaidBookings: 0 };
  }

  const { count: sellerCompleted } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", sellerVars)
    .eq("payment_status", "paid")
    .eq("status", "completed");

  const { count: listingCompleted } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("listing_id", listingVars)
    .eq("payment_status", "paid")
    .eq("status", "completed");

  const { count: sellerPaid } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", sellerVars)
    .eq("payment_status", "paid");

  return {
    sellerCompletedPaid: sellerCompleted ?? 0,
    listingCompletedPaid: listingCompleted ?? 0,
    sellerPaidBookings: sellerPaid ?? 0,
  };
}
