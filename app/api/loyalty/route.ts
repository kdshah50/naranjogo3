import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import {
  REWARD_EVERY_N_BOOKINGS,
  REWARD_DISCOUNT_PCT,
  REBOOK_DISCOUNT_PCT,
  getNextBookingDiscount,
} from "@/lib/loyalty";

export const dynamic = "force-dynamic";

/**
 * GET /api/loyalty
 * Returns the authenticated user's loyalty account + recent transactions.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const supabase = createAdminSupabase();

  const { data: account } = await supabase
    .from("loyalty_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: transactions } = await supabase
    .from("loyalty_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const progress = await getNextBookingDiscount(supabase, userId);

  return NextResponse.json({
    account: account ?? {
      points_balance: 0,
      points_earned_total: 0,
      points_redeemed_total: 0,
      booking_count: 0,
    },
    transactions: transactions ?? [],
    reward: {
      everyN: REWARD_EVERY_N_BOOKINGS,
      discountPct: progress.discountPct,
      milestoneDiscountPct: REWARD_DISCOUNT_PCT,
      rebookDiscountPct: REBOOK_DISCOUNT_PCT,
      bookingsUntilReward: progress.bookingsUntilReward,
      bookingCount: progress.bookingCount,
      rebookDiscount: progress.rebookDiscount,
      milestoneDiscount: progress.milestoneDiscount,
    },
  });
}
