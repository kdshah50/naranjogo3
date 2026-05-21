import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WalletLedgerKind } from "@/lib/rides/wallet-server";

export type WalletMutationResult =
  | { ok: true; ledgerId: string; alreadyApplied?: boolean }
  | { ok: false; error: string; code?: string };

async function ledgerExists(
  supabase: SupabaseClient,
  args: { userId: string; rideBookingId: string; kind: WalletLedgerKind }
): Promise<boolean> {
  const { data } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", args.userId)
    .eq("ride_booking_id", args.rideBookingId)
    .eq("kind", args.kind)
    .maybeSingle();
  return Boolean(data?.id);
}

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
  version: number
): Promise<boolean> {
  const { error } = await supabase.from("wallets").upsert(
    {
      user_id: userId,
      balance_mxn_cents: Math.max(0, Math.round(balance)),
      held_mxn_cents: Math.max(0, Math.round(held)),
      version: version + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[wallet-hold] upsert", error, { userId, balance, held });
    return false;
  }
  return true;
}

/**
 * Reserve buyer saldo at match time. Moves funds from balance → held.
 */
export async function holdWalletForRide(
  supabase: SupabaseClient,
  args: {
    userId: string;
    rideBookingId: string;
    holdAmountMxnCents: number;
    meta?: Record<string, unknown>;
  }
): Promise<WalletMutationResult> {
  const userId = String(args.userId).trim();
  const rideBookingId = String(args.rideBookingId).trim();
  const amount = Math.round(Number(args.holdAmountMxnCents));

  if (!userId || !rideBookingId) return { ok: false, error: "userId and rideBookingId required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid hold amount" };

  if (await ledgerExists(supabase, { userId, rideBookingId, kind: "hold" })) {
    return { ok: true, ledgerId: "", alreadyApplied: true };
  }

  const wallet = await readWalletRow(supabase, userId);
  if (wallet.balance < amount) {
    return { ok: false, error: "Saldo insuficiente para reservar el viaje", code: "insufficient_balance" };
  }

  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: "hold",
      amount_mxn_cents: amount,
      ride_booking_id: rideBookingId,
      meta: args.meta ?? {},
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    console.error("[wallet-hold] hold insert", ledgerInsert.error);
    return { ok: false, error: "No se pudo reservar saldo" };
  }

  const ok = await upsertWallet(
    supabase,
    userId,
    wallet.balance - amount,
    wallet.held + amount,
    wallet.version
  );
  if (!ok) {
    return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? ""), alreadyApplied: false };
  }

  return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? "") };
}

/**
 * Return held funds to spendable balance (cancel or pre-capture release).
 */
export async function releaseWalletHoldForRide(
  supabase: SupabaseClient,
  args: {
    userId: string;
    rideBookingId: string;
    releaseAmountMxnCents: number;
    meta?: Record<string, unknown>;
  }
): Promise<WalletMutationResult> {
  const userId = String(args.userId).trim();
  const rideBookingId = String(args.rideBookingId).trim();
  const amount = Math.round(Number(args.releaseAmountMxnCents));

  if (!userId || !rideBookingId) return { ok: false, error: "userId and rideBookingId required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid release amount" };

  if (await ledgerExists(supabase, { userId, rideBookingId, kind: "release" })) {
    return { ok: true, ledgerId: "", alreadyApplied: true };
  }

  const wallet = await readWalletRow(supabase, userId);
  const releaseAmt = Math.min(amount, wallet.held);

  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: "release",
      amount_mxn_cents: releaseAmt,
      ride_booking_id: rideBookingId,
      meta: args.meta ?? {},
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    console.error("[wallet-hold] release insert", ledgerInsert.error);
    return { ok: false, error: "No se pudo liberar la reserva" };
  }

  await upsertWallet(
    supabase,
    userId,
    wallet.balance + releaseAmt,
    wallet.held - releaseAmt,
    wallet.version
  );

  return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? "") };
}

/**
 * Debit buyer after hold was released (fare or cancel fee).
 */
export async function captureFromBuyerWallet(
  supabase: SupabaseClient,
  args: {
    userId: string;
    rideBookingId: string;
    captureAmountMxnCents: number;
    meta?: Record<string, unknown>;
  }
): Promise<WalletMutationResult> {
  const userId = String(args.userId).trim();
  const rideBookingId = String(args.rideBookingId).trim();
  const amount = Math.round(Number(args.captureAmountMxnCents));

  if (!userId || !rideBookingId) return { ok: false, error: "userId and rideBookingId required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true, ledgerId: "" };

  const kind: WalletLedgerKind = "capture";
  const idemKey = String(args.meta?.capture_kind ?? "fare");
  const { data: existing } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("ride_booking_id", rideBookingId)
    .eq("kind", kind)
    .contains("meta", { capture_kind: idemKey })
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, ledgerId: String(existing.id), alreadyApplied: true };
  }

  const wallet = await readWalletRow(supabase, userId);
  if (wallet.balance < amount) {
    return { ok: false, error: "Saldo insuficiente para cobrar el viaje", code: "insufficient_balance" };
  }

  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: "capture",
      amount_mxn_cents: -amount,
      ride_booking_id: rideBookingId,
      meta: { ...(args.meta ?? {}), capture_kind: idemKey },
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    console.error("[wallet-hold] capture insert", ledgerInsert.error);
    return { ok: false, error: "No se pudo cobrar el viaje" };
  }

  await upsertWallet(supabase, userId, wallet.balance - amount, wallet.held, wallet.version);
  return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? "") };
}

/**
 * Credit driver wallet (fare minus commission, or tip).
 */
export async function creditDriverWallet(
  supabase: SupabaseClient,
  args: {
    userId: string;
    rideBookingId: string;
    amountMxnCents: number;
    meta?: Record<string, unknown>;
  }
): Promise<WalletMutationResult> {
  const userId = String(args.userId).trim();
  const rideBookingId = String(args.rideBookingId).trim();
  const amount = Math.round(Number(args.amountMxnCents));

  if (!userId || !rideBookingId) return { ok: false, error: "userId and rideBookingId required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true, ledgerId: "" };

  const payoutKind = String(args.meta?.payout_kind ?? "fare");
  const { data: existing } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("ride_booking_id", rideBookingId)
    .eq("kind", "adjustment")
    .contains("meta", { payout_kind: payoutKind })
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, ledgerId: String(existing.id), alreadyApplied: true };
  }

  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: "adjustment",
      amount_mxn_cents: amount,
      ride_booking_id: rideBookingId,
      meta: { ...(args.meta ?? {}), payout_kind: payoutKind },
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    console.error("[wallet-hold] driver credit insert", ledgerInsert.error);
    return { ok: false, error: "No se pudo acreditar al conductor" };
  }

  const wallet = await readWalletRow(supabase, userId);
  await upsertWallet(
    supabase,
    userId,
    wallet.balance + amount,
    wallet.held,
    wallet.version
  );

  return { ok: true, ledgerId: String(ledgerInsert.data?.id ?? "") };
}

export async function hasHoldForRide(
  supabase: SupabaseClient,
  userId: string,
  rideBookingId: string
): Promise<boolean> {
  return ledgerExists(supabase, { userId, rideBookingId, kind: "hold" });
}
