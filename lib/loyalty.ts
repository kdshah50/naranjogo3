import { SupabaseClient } from "@supabase/supabase-js";

// 1 point per $1 MXN of commission paid
export const POINTS_PER_MXN = 1;

// Every 5th booking = 15% discount on platform fee
export const REWARD_EVERY_N_BOOKINGS = 5;
export const REWARD_DISCOUNT_PCT = 15;

/** Repeat bookers (2nd+ paid booking on platform): smaller discount — behavioral lock-in */
export const REBOOK_DISCOUNT_PCT = 7;

// Minimum points to redeem (prevents tiny redemptions)
export const MIN_POINTS_TO_REDEEM = 10;

export function commissionCentsToPoints(commissionCents: number): number {
  return Math.floor((commissionCents / 100) * POINTS_PER_MXN);
}

/**
 * Award points after a successful booking payment.
 * Creates or updates the loyalty account and logs the transaction.
 */
export async function awardPoints(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string,
  commissionCents: number,
): Promise<void> {
  const points = commissionCentsToPoints(commissionCents);
  if (points <= 0) return;

  const { data: existing } = await supabase
    .from("loyalty_accounts")
    .select("points_balance,points_earned_total,booking_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("loyalty_accounts")
      .update({
        points_balance: existing.points_balance + points,
        points_earned_total: existing.points_earned_total + points,
        booking_count: existing.booking_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } else {
    await supabase
      .from("loyalty_accounts")
      .insert({
        user_id: userId,
        points_balance: points,
        points_earned_total: points,
        booking_count: 1,
      });
  }

  await supabase
    .from("loyalty_transactions")
    .insert({
      user_id: userId,
      booking_id: bookingId,
      type: "earn",
      points,
      description: `+${points} pts por reserva`,
    });
}

/**
 * Check if the user qualifies for a milestone discount on their next booking.
 * Returns the discount percentage (0 if no discount).
 */
export async function getNextBookingDiscount(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  discountPct: number;
  bookingCount: number;
  bookingsUntilReward: number;
  rebookDiscount: boolean;
  milestoneDiscount: boolean;
}> {
  const { data } = await supabase
    .from("loyalty_accounts")
    .select("booking_count")
    .eq("user_id", userId)
    .maybeSingle();

  const count = data?.booking_count ?? 0;
  const nextMilestone = Math.ceil((count + 1) / REWARD_EVERY_N_BOOKINGS) * REWARD_EVERY_N_BOOKINGS;
  const bookingsUntilReward = nextMilestone - count;

  const milestoneQualifies = (count + 1) % REWARD_EVERY_N_BOOKINGS === 0 && count > 0;
  let discountPct = 0;
  let rebookDiscount = false;
  let milestoneDiscount = false;

  if (milestoneQualifies) {
    discountPct = REWARD_DISCOUNT_PCT;
    milestoneDiscount = true;
  } else if (count >= 1) {
    discountPct = REBOOK_DISCOUNT_PCT;
    rebookDiscount = true;
  }

  return {
    discountPct,
    bookingCount: count,
    bookingsUntilReward: milestoneQualifies ? 0 : bookingsUntilReward,
    rebookDiscount,
    milestoneDiscount,
  };
}

/**
 * Apply a loyalty discount: deduct points and log the redemption.
 */
export async function redeemDiscount(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string,
  discountCents: number,
  discountPctApplied = REWARD_DISCOUNT_PCT,
): Promise<void> {
  const points = commissionCentsToPoints(discountCents);
  if (points <= 0) return;

  const { data } = await supabase
    .from("loyalty_accounts")
    .select("points_balance,points_redeemed_total")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return;

  await supabase
    .from("loyalty_accounts")
    .update({
      points_redeemed_total: data.points_redeemed_total + points,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await supabase
    .from("loyalty_transactions")
    .insert({
      user_id: userId,
      booking_id: bookingId,
      type: "redeem",
      points: -points,
      description: `-${points} pts canjeados (descuento ${discountPctApplied}%)`,
    });
}
