import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

/**
 * |A ∪ B| for A = paid bookings with seller_id ∈ pool, B = paid with listing_id ∈ owned,
 * same filters on payment_status / status. Avoids one huge PostgREST `.or()` (can truncate / miscount).
 */
async function countPaidBookingsUnionSellerListingScope(
  supabase: SupabaseClient,
  sellerIdVariants: string[],
  listingIdVariants: string[],
  status: "any" | "completed" | "cancelled",
): Promise<number> {
  const hasSeller = sellerIdVariants.length > 0;
  const hasList = listingIdVariants.length > 0;
  if (!hasSeller && !hasList) return 0;

  const scoped = () => {
    let q = supabase.from("service_bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid");
    if (status === "completed") q = q.eq("status", "completed");
    else if (status === "cancelled") q = q.eq("status", "cancelled");
    return q;
  };

  let a = 0;
  let b = 0;
  let ab = 0;

  if (hasSeller) {
    const { count, error } = await scoped().in("seller_id", sellerIdVariants);
    if (error) throw error;
    a = count ?? 0;
  }
  if (hasList) {
    const { count, error } = await scoped().in("listing_id", listingIdVariants);
    if (error) throw error;
    b = count ?? 0;
  }
  if (hasSeller && hasList) {
    const { count, error } = await scoped().in("seller_id", sellerIdVariants).in("listing_id", listingIdVariants);
    if (error) throw error;
    ab = count ?? 0;
  }

  return a + b - ab;
}

export type SellerPlatformJobStats = {
  /** Paid bookings marked completed (all seller listings). */
  sellerCompletedPaid: number;
  /** Paid platform bookings for this listing marked completed. */
  listingCompletedPaid: number;
  /** Any paid booking on platform for seller (all listings, all buyers). */
  sellerPaidBookings: number;
  /** Any paid booking on this listing only (all buyers, any lifecycle). */
  listingPaidBookings: number;
  /** This listing: paid and not yet completed or cancelled (open / in progress). */
  listingActivePaidBookings: number;
};

/** Seller-wide counts for `/seller-bookings`: same visibility as merged list (seller_id pool OR listing you own). */
export async function getSellerAccountBookingCounts(
  supabase: SupabaseClient,
  sellerIdVariants: string[],
  listingIdVariants: string[],
): Promise<{
  sellerCompletedPaid: number;
  sellerPaidBookings: number;
  /** Paid and not completed/cancelled — provider should advance lifecycle. */
  sellerActivePaidBookings: number;
}> {
  const hasSeller = sellerIdVariants.length > 0;
  const hasList = listingIdVariants.length > 0;
  if (!hasSeller && !hasList) {
    return { sellerCompletedPaid: 0, sellerPaidBookings: 0, sellerActivePaidBookings: 0 };
  }

  const [paid, completed, cancelled] = await Promise.all([
    countPaidBookingsUnionSellerListingScope(supabase, sellerIdVariants, listingIdVariants, "any"),
    countPaidBookingsUnionSellerListingScope(supabase, sellerIdVariants, listingIdVariants, "completed"),
    countPaidBookingsUnionSellerListingScope(supabase, sellerIdVariants, listingIdVariants, "cancelled"),
  ]);

  /** Derive so “paid = completed + active + cancelled” always matches the banner. */
  const activeDerived = Math.max(0, paid - completed - cancelled);

  return {
    sellerCompletedPaid: completed,
    sellerPaidBookings: paid,
    sellerActivePaidBookings: activeDerived,
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
    return {
      sellerCompletedPaid: 0,
      listingCompletedPaid: 0,
      sellerPaidBookings: 0,
      listingPaidBookings: 0,
      listingActivePaidBookings: 0,
    };
  }

  const [
    { count: sellerCompleted },
    { count: listingCompleted },
    { count: sellerPaid },
    { count: listingPaid },
    { count: listingCancelled },
  ] = await Promise.all([
    supabase
      .from("service_bookings")
      .select("id", { count: "exact", head: true })
      .in("seller_id", sellerVars)
      .eq("payment_status", "paid")
      .eq("status", "completed"),
    supabase
      .from("service_bookings")
      .select("id", { count: "exact", head: true })
      .in("listing_id", listingVars)
      .eq("payment_status", "paid")
      .eq("status", "completed"),
    supabase
      .from("service_bookings")
      .select("id", { count: "exact", head: true })
      .in("seller_id", sellerVars)
      .eq("payment_status", "paid"),
    supabase
      .from("service_bookings")
      .select("id", { count: "exact", head: true })
      .in("listing_id", listingVars)
      .eq("payment_status", "paid"),
    supabase
      .from("service_bookings")
      .select("id", { count: "exact", head: true })
      .in("listing_id", listingVars)
      .eq("payment_status", "paid")
      .eq("status", "cancelled"),
  ]);

  const lp = listingPaid ?? 0;
  const lc = listingCompleted ?? 0;
  const lx = listingCancelled ?? 0;

  return {
    sellerCompletedPaid: sellerCompleted ?? 0,
    listingCompletedPaid: lc,
    sellerPaidBookings: sellerPaid ?? 0,
    listingPaidBookings: lp,
    listingActivePaidBookings: Math.max(0, lp - lc - lx),
  };
}
