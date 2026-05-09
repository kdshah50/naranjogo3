import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

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

  const [{ count: sellerCompleted }, { count: sellerPaid }, { count: sellerCancelled }] = await Promise.all([
    scopedPaid().eq("status", "completed"),
    scopedPaid(),
    scopedPaid().eq("status", "cancelled"),
  ]);

  const paid = sellerPaid ?? 0;
  const completed = sellerCompleted ?? 0;
  const cancelled = sellerCancelled ?? 0;
  /** Derive so “paid = completed + active + cancelled” always matches the banner (avoids stray active count vs head queries). */
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
