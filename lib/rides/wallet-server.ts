import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side wallet operations for the rides module (Phase 0).
 *
 * The ledger (`wallet_ledger`) is the source of truth — never UPDATE or DELETE
 * those rows. The `wallets` table is a cached summary kept in sync by the
 * helpers below. If they ever drift, a reconciliation job (later) can rebuild
 * `wallets` from the ledger.
 *
 * See: docs/RIDES_AI_PLAN.md §9 (Wallet + OXXO).
 */

export type WalletLedgerKind =
  | "load"
  | "load_bonus"
  | "hold"
  | "release"
  | "capture"
  | "refund"
  | "payout_debit"
  | "adjustment";

export type WalletLedgerEntry = {
  id: string;
  user_id: string;
  kind: WalletLedgerKind;
  amount_mxn_cents: number;
  ride_booking_id: string | null;
  stripe_pi_id: string | null;
  oxxo_voucher_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type WalletSummary = {
  user_id: string;
  balance_mxn_cents: number;
  held_mxn_cents: number;
  version: number;
  recent_ledger: WalletLedgerEntry[];
};

/**
 * Read a user's wallet summary and most recent ledger entries.
 * Returns a zeroed wallet (balance 0, held 0) if the user has never loaded saldo.
 */
export async function getWalletForUser(
  supabase: SupabaseClient,
  userId: string,
  options: { ledgerLimit?: number } = {}
): Promise<WalletSummary> {
  const uid = String(userId).trim();
  if (!uid) {
    throw new Error("getWalletForUser: userId is required");
  }

  const ledgerLimit = Math.min(Math.max(options.ledgerLimit ?? 20, 1), 100);

  const [walletRes, ledgerRes] = await Promise.all([
    supabase
      .from("wallets")
      .select("user_id,balance_mxn_cents,held_mxn_cents,version")
      .eq("user_id", uid)
      .maybeSingle(),
    supabase
      .from("wallet_ledger")
      .select(
        "id,user_id,kind,amount_mxn_cents,ride_booking_id,stripe_pi_id,oxxo_voucher_id,meta,created_at"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(ledgerLimit),
  ]);

  if (walletRes.error) {
    console.error("[wallet-server] get wallet", walletRes.error);
    throw new Error("Could not read wallet");
  }
  if (ledgerRes.error) {
    console.error("[wallet-server] get ledger", ledgerRes.error);
    throw new Error("Could not read wallet ledger");
  }

  return {
    user_id: uid,
    balance_mxn_cents: Number(walletRes.data?.balance_mxn_cents ?? 0),
    held_mxn_cents: Number(walletRes.data?.held_mxn_cents ?? 0),
    version: Number(walletRes.data?.version ?? 0),
    recent_ledger: (ledgerRes.data ?? []) as WalletLedgerEntry[],
  };
}

export type CreditWalletArgs = {
  userId: string;
  amountMxnCents: number;
  kind: Extract<WalletLedgerKind, "load" | "load_bonus" | "refund" | "adjustment">;
  /** Required for `load` kind — guarantees idempotency against duplicate Stripe webhooks. */
  stripePaymentIntentId?: string | null;
  oxxoVoucherId?: string | null;
  meta?: Record<string, unknown>;
};

export type CreditWalletResult =
  | { ok: true; ledgerId: string; newBalanceMxnCents: number; alreadyApplied: false }
  | { ok: true; ledgerId: string; newBalanceMxnCents: number; alreadyApplied: true }
  | { ok: false; error: string };

/**
 * Credit a user's wallet (load, bonus, refund, or admin adjustment).
 *
 * Two-step write:
 *   1. INSERT into wallet_ledger — if `kind='load'` and `stripe_pi_id` collides
 *      with an existing row, the unique index causes a duplicate-key error and
 *      we return `alreadyApplied: true` (safe webhook replay).
 *   2. UPSERT the wallets row to bump balance + version.
 *
 * If step 2 fails after step 1 succeeds, the ledger row is the source of truth
 * and a future reconciliation job will heal `wallets`.
 */
export async function creditWallet(
  supabase: SupabaseClient,
  args: CreditWalletArgs
): Promise<CreditWalletResult> {
  const userId = String(args.userId).trim();
  const amount = Math.round(Number(args.amountMxnCents));

  if (!userId) {
    return { ok: false, error: "userId is required" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amountMxnCents must be a positive integer (centavos)" };
  }
  if (args.kind === "load" && !args.stripePaymentIntentId) {
    return { ok: false, error: "stripePaymentIntentId is required for kind='load' (idempotency)" };
  }

  // Step 1: insert ledger entry (unique index guards against duplicate loads).
  const ledgerInsert = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: userId,
      kind: args.kind,
      amount_mxn_cents: amount,
      stripe_pi_id: args.stripePaymentIntentId ?? null,
      oxxo_voucher_id: args.oxxoVoucherId ?? null,
      meta: args.meta ?? {},
    })
    .select("id")
    .single();

  if (ledgerInsert.error) {
    const isDuplicate =
      ledgerInsert.error.code === "23505" ||
      /duplicate key|unique constraint/i.test(String(ledgerInsert.error.message ?? ""));

    if (isDuplicate && args.kind === "load" && args.stripePaymentIntentId) {
      // Already credited for this PaymentIntent — idempotent no-op.
      const { data: existing } = await supabase
        .from("wallet_ledger")
        .select("id")
        .eq("stripe_pi_id", args.stripePaymentIntentId)
        .eq("kind", "load")
        .maybeSingle();
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance_mxn_cents")
        .eq("user_id", userId)
        .maybeSingle();

      return {
        ok: true,
        ledgerId: String(existing?.id ?? ""),
        newBalanceMxnCents: Number(wallet?.balance_mxn_cents ?? 0),
        alreadyApplied: true,
      };
    }

    console.error("[wallet-server] ledger insert", ledgerInsert.error);
    return { ok: false, error: "Could not record ledger entry" };
  }

  const ledgerId = String(ledgerInsert.data?.id ?? "");

  // Step 2: bump wallet balance. UPSERT so a brand-new user gets their first row.
  const { data: existingWallet } = await supabase
    .from("wallets")
    .select("balance_mxn_cents,version")
    .eq("user_id", userId)
    .maybeSingle();

  const currentBalance = Number(existingWallet?.balance_mxn_cents ?? 0);
  const currentVersion = Number(existingWallet?.version ?? 0);
  const newBalance = currentBalance + amount;

  const upsertRes = await supabase
    .from("wallets")
    .upsert(
      {
        user_id: userId,
        balance_mxn_cents: newBalance,
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertRes.error) {
    console.error("[wallet-server] wallet upsert", upsertRes.error, {
      userId,
      ledgerId,
      amount,
    });
    // Ledger entry already saved — return success with the new (eventual) balance.
    // A reconciliation job will heal `wallets` if needed.
    return {
      ok: true,
      ledgerId,
      newBalanceMxnCents: newBalance,
      alreadyApplied: false,
    };
  }

  return {
    ok: true,
    ledgerId,
    newBalanceMxnCents: newBalance,
    alreadyApplied: false,
  };
}
