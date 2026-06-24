import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WalletMutationResult } from "@/lib/rides/wallet-hold";

async function readWalletRow(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents,version")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    balance: Number(data?.balance_mxn_cents ?? 0),
    held: Number(data?.held_mxn_cents ?? 0),
    version: Number(data?.version ?? 0),
  };
}

async function upsertWallet(
  supabase: SupabaseClient,
  userId: string,
  balance: number,
  held: number,
  version: number,
): Promise<boolean> {
  const { error } = await supabase.from("wallets").upsert(
    {
      user_id: userId,
      balance_mxn_cents: Math.max(0, Math.round(balance)),
      held_mxn_cents: Math.max(0, Math.round(held)),
      version: version + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[wallet-service-payment] upsert", error, { userId, balance, held });
    return false;
  }
  return true;
}

/**
 * Debit buyer saldo for a service booking deposit (commission_only checkout).
 * Idempotent per service_booking_id via ledger meta.
 */
export async function captureWalletForServiceDeposit(
  supabase: SupabaseClient,
  args: {
    userId: string;
    serviceBookingId: string;
    amountMxnCents: number;
  },
): Promise<WalletMutationResult> {
  const userId = String(args.userId).trim();
  const serviceBookingId = String(args.serviceBookingId).trim();
  const amount = Math.round(Number(args.amountMxnCents));

  if (!userId || !serviceBookingId) {
    return { ok: false, error: "userId and serviceBookingId required" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid amount" };
  }

  const idemMeta = { service_booking_id: serviceBookingId, capture_kind: "service_deposit" };
  const { data: existing } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "capture")
    .contains("meta", idemMeta)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, ledgerId: String(existing.id), alreadyApplied: true };
  }

  const wallet = await readWalletRow(supabase, userId);
  if (wallet.balance < amount) {
    return {
      ok: false,
      error: "Saldo insuficiente. Carga saldo en /saldo e intenta de nuevo.",
      code: "insufficient_balance",
    };
  }

  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: "capture",
      amount_mxn_cents: -amount,
      meta: idemMeta,
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    console.error("[wallet-service-payment] capture insert", ledgerInsert.error);
    return { ok: false, error: "No se pudo cobrar el saldo" };
  }

  await upsertWallet(supabase, userId, wallet.balance - amount, wallet.held, wallet.version);
  return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? "") };
}
