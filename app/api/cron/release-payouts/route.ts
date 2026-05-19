/**
 * Picks up service bookings whose payout hold has elapsed and fires the
 * Stripe Transfer to release the seller's share. Designed for Vercel Cron.
 *
 * Hook up by adding to vercel.json:
 *   {
 *     "crons": [
 *       { "path": "/api/cron/release-payouts", "schedule": "*\/15 * * * *" }
 *     ]
 *   }
 *
 * Auth: Bearer token from env `CRON_SECRET` so external callers can't
 * trigger payouts manually. Vercel Cron sends the secret in the
 * Authorization header automatically when the env is set.
 *
 * Idempotent — `releasePayout` skips rows already marked transferred.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import {
  isEscrowEnabled,
  releasePayout,
  type BookingPayoutRow,
} from "@/lib/payouts-escrow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 25;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (expected && provided !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isEscrowEnabled()) {
    return NextResponse.json({ ok: true, escrow: "disabled", processed: 0 });
  }

  const supabase = createAdminSupabase();
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("service_bookings")
    .select(
      "id,seller_id,buyer_id,subtotal_mxn_cents,total_charged_mxn_cents,payout_amount_mxn_cents,payout_status,payout_transfer_id,payout_release_after,checkout_mode,payment_status,stripe_checkout_session_id",
    )
    .eq("payout_status", "pending")
    .eq("payment_status", "paid")
    .lte("payout_release_after", nowIso)
    .order("payout_release_after", { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error("[cron/release-payouts] query", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  let releasedOk = 0;
  let releasedFail = 0;
  const failures: { id: string; reason: string }[] = [];
  for (const row of (rows ?? []) as BookingPayoutRow[]) {
    const r = await releasePayout(supabase, row);
    if (r.ok) releasedOk += 1;
    else {
      releasedFail += 1;
      failures.push({ id: row.id, reason: r.reason });
    }
  }

  return NextResponse.json({
    ok: true,
    escrow: "enabled",
    scanned: rows?.length ?? 0,
    releasedOk,
    releasedFail,
    failures,
  });
}
