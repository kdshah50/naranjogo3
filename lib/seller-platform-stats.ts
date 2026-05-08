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

/** Seller-wide counts for `/seller-bookings` (same filters as listing trust strip, no listing scope). */
export async function getSellerAccountBookingCounts(
  supabase: SupabaseClient,
  sellerIdVariants: string[],
): Promise<{ sellerCompletedPaid: number; sellerPaidBookings: number }> {
  if (sellerIdVariants.length === 0) {
    return { sellerCompletedPaid: 0, sellerPaidBookings: 0 };
  }
  const { count: sellerCompleted } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", sellerIdVariants)
    .eq("payment_status", "paid")
    .eq("status", "completed");

  const { count: sellerPaid } = await supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("seller_id", sellerIdVariants)
    .eq("payment_status", "paid");

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
