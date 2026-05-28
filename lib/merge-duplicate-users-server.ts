import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

type IdPair = { fromId: string; toId: string };

async function updateColumn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  pair: IdPair,
): Promise<void> {
  const fromVars = idMatchVariantsForIn(pair.fromId);
  if (fromVars.length === 0) return;

  const { error } = await supabase.from(table).update({ [column]: pair.toId }).in(column, fromVars);
  if (error) {
    throw new Error(`[merge-users] ${table}.${column} ${pair.fromId.slice(0, 8)}→${pair.toId.slice(0, 8)}: ${error.message}`);
  }
}

/** Merge listing threads when both buyer ids had a row for the same listing. */
async function mergeListingConversations(
  supabase: SupabaseClient,
  pair: IdPair,
): Promise<void> {
  const fromVars = idMatchVariantsForIn(pair.fromId);
  const { data: dupConvs, error } = await supabase
    .from("listing_conversations")
    .select("id,listing_id,buyer_id")
    .in("buyer_id", fromVars);

  if (error) throw new Error(`[merge-users] listing_conversations read: ${error.message}`);
  if (!dupConvs?.length) return;

  for (const dup of dupConvs) {
    const listingId = String(dup.listing_id);
    const toVars = idMatchVariantsForIn(pair.toId);
    const { data: existing } = await supabase
      .from("listing_conversations")
      .select("id")
      .eq("listing_id", listingId)
      .in("buyer_id", toVars)
      .maybeSingle();

    if (existing?.id && String(existing.id) !== String(dup.id)) {
      const { error: msgErr } = await supabase
        .from("listing_messages")
        .update({ conversation_id: existing.id })
        .eq("conversation_id", dup.id);
      if (msgErr) {
        throw new Error(`[merge-users] listing_messages repoint: ${msgErr.message}`);
      }
      const { error: delErr } = await supabase.from("listing_conversations").delete().eq("id", dup.id);
      if (delErr) throw new Error(`[merge-users] listing_conversations delete: ${delErr.message}`);
    }
  }

  await updateColumn(supabase, "listing_conversations", "buyer_id", pair);
  await updateColumn(supabase, "listing_conversations", "seller_id", pair);
}

/** Repoint all known FKs from duplicate user → canonical user, then delete duplicate row. */
export async function mergeUserAccountInto(
  supabase: SupabaseClient,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;
  const pair = { fromId, toId };

  await mergeListingConversations(supabase, pair);

  const simple: Array<[string, string]> = [
    ["listings", "seller_id"],
    ["service_bookings", "buyer_id"],
    ["service_bookings", "seller_id"],
    ["listing_service_contact_gate", "buyer_id"],
    ["service_booking_requests", "buyer_id"],
    ["seller_reviews", "buyer_id"],
    ["seller_reviews", "seller_id"],
    ["guarantee_claims", "buyer_id"],
    ["guarantee_claims", "seller_id"],
    ["booking_reminders", "buyer_id"],
    ["booking_reminders", "seller_id"],
    ["marketplace_orders", "buyer_id"],
    ["marketplace_orders", "seller_id"],
    ["seller_strike_events", "seller_id"],
    ["reports", "seller_id"],
    ["listing_messages", "sender_id"],
    ["booking_events", "actor_id"],
    ["loyalty_transactions", "user_id"],
    ["user_favorite_listings", "user_id"],
  ];

  for (const [table, column] of simple) {
    await updateColumn(supabase, table, column, pair);
  }

  const fromVars = idMatchVariantsForIn(fromId);
  const toVars = idMatchVariantsForIn(toId);

  const { data: dupReferrals } = await supabase
    .from("users")
    .select("id")
    .in("referred_by", fromVars);
  for (const row of dupReferrals ?? []) {
    await supabase.from("users").update({ referred_by: toId }).eq("id", row.id);
  }

  const { data: dupCode } = await supabase
    .from("referral_codes")
    .select("user_id")
    .in("user_id", fromVars)
    .maybeSingle();
  const { data: canonCode } = await supabase
    .from("referral_codes")
    .select("user_id")
    .in("user_id", toVars)
    .maybeSingle();

  if (dupCode?.user_id && !canonCode?.user_id) {
    await supabase.from("referral_codes").update({ user_id: toId }).in("user_id", fromVars);
  } else if (dupCode?.user_id && canonCode?.user_id) {
    await supabase.from("referral_codes").delete().in("user_id", fromVars);
  }

  const { data: dupLoyalty } = await supabase
    .from("loyalty_accounts")
    .select("user_id")
    .in("user_id", fromVars)
    .maybeSingle();
  if (dupLoyalty?.user_id) {
    const { data: canonLoyalty } = await supabase
      .from("loyalty_accounts")
      .select("user_id")
      .in("user_id", toVars)
      .maybeSingle();
    if (!canonLoyalty?.user_id) {
      await supabase.from("loyalty_accounts").update({ user_id: toId }).in("user_id", fromVars);
    } else {
      await supabase.from("loyalty_accounts").delete().in("user_id", fromVars);
    }
  }

  const { error: delErr } = await supabase.from("users").delete().in("id", fromVars);
  if (delErr) {
    throw new Error(`[merge-users] delete user ${fromId}: ${delErr.message}`);
  }
}
