import type { SupabaseClient } from "@supabase/supabase-js";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import {
  HOUSEKEEPING_SERVICE,
  providerServiceSupportsSupplementPayments,
} from "@/lib/provider-services";
import { sellerConnectPayoutReady } from "@/lib/stripe-connect-ready";

export type HousekeepingPaymentRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  payment_status: string;
  checkout_mode?: string | null;
  pricing_base_mxn_cents?: number | null;
  commission_amount_cents?: number | null;
  balance_due_mxn_cents?: number | null;
  balance_payment_status?: string | null;
  balance_paid_at?: string | null;
  tip_mxn_cents?: number | null;
  tip_payment_status?: string | null;
  appointment_at?: string | null;
  ticket_code?: string | null;
};

export function computeBalanceDueCents(row: {
  pricing_base_mxn_cents?: number | null;
  commission_amount_cents?: number | null;
}): number {
  const base = Math.round(Number(row.pricing_base_mxn_cents ?? 0));
  const deposit = Math.round(Number(row.commission_amount_cents ?? 0));
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.max(0, base - Math.max(0, deposit));
}

export async function listingProviderSlug(
  supabase: SupabaseClient,
  listingId: string,
): Promise<string | null> {
  const { data } = await supabase.from("listings").select("title_es").eq("id", listingId).maybeSingle();
  return inferProviderSlugFromListingTitle(String(data?.title_es ?? ""));
}

export async function listingSupportsSupplementPayments(
  supabase: SupabaseClient,
  listingId: string,
): Promise<boolean> {
  const slug = await listingProviderSlug(supabase, listingId);
  return providerServiceSupportsSupplementPayments(slug);
}

/** @deprecated Use listingSupportsSupplementPayments — kept for call-site clarity in HK-only docs. */
export async function listingIsHousekeeping(
  supabase: SupabaseClient,
  listingId: string,
): Promise<boolean> {
  return listingSupportsSupplementPayments(supabase, listingId);
}

export async function sellerHasConnectForHousekeeping(
  supabase: SupabaseClient,
  sellerId: string,
): Promise<boolean> {
  const status = await sellerConnectPayoutReady(supabase, sellerId);
  return status.payoutReady;
}

export function balancePayable(row: HousekeepingPaymentRow): boolean {
  return (
    row.payment_status === "paid" &&
    row.status === "completed" &&
    String(row.balance_payment_status ?? "none") === "pending" &&
    Math.round(Number(row.balance_due_mxn_cents ?? 0)) >= 100
  );
}

export function tipPayable(row: HousekeepingPaymentRow): boolean {
  const balOk =
    String(row.balance_payment_status ?? "none") === "paid" ||
    String(row.balance_payment_status ?? "none") === "waived" ||
    Math.round(Number(row.balance_due_mxn_cents ?? 0)) < 100;
  return row.payment_status === "paid" && row.status === "completed" && balOk && String(row.tip_payment_status ?? "none") !== "paid";
}
