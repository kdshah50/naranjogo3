/**
 * Shared helpers for rides QA scripts (no server-only imports).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const CANONICAL_DRIVER_ID =
  process.env.RIDES_STAGING_DRIVER_USER_ID?.trim() ||
  "3d5522b3-aedf-4625-80a1-8a79708bb893";

export const DUPLICATE_TEST_IDS = [
  CANONICAL_DRIVER_ID,
  "94a74ff0-d2f4-46a7-b43e-85fb8f2cf524",
  "7003532b-1bba-4bbe-8b7e-b89e86051169",
  "8ce0201b-da82-46ce-8af3-3432a2f66b79",
];

const OPEN_STATUSES = ["requested", "matched", "accepted", "arrived", "in_trip"] as const;

export function loadDotenv() {
  for (const name of [".env.local", ".env"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

export function createTestSupabase(): SupabaseClient {
  loadDotenv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function releaseHoldIfNeeded(
  supabase: SupabaseClient,
  args: { userId: string; rideBookingId: string; holdAmountMxnCents: number; reason: string },
): Promise<boolean> {
  const userId = String(args.userId).trim();
  const rideBookingId = String(args.rideBookingId).trim();
  const amount = Math.round(Number(args.holdAmountMxnCents));
  if (!userId || !rideBookingId || amount <= 0) return false;

  const { data: existingRelease } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("ride_booking_id", rideBookingId)
    .eq("kind", "release")
    .maybeSingle();
  if (existingRelease?.id) return false;

  const { data: holdRow } = await supabase
    .from("wallet_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("ride_booking_id", rideBookingId)
    .eq("kind", "hold")
    .maybeSingle();
  if (!holdRow?.id) return false;

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents,version")
    .eq("user_id", userId)
    .maybeSingle();

  const balance = Number(wallet?.balance_mxn_cents ?? 0);
  const held = Number(wallet?.held_mxn_cents ?? 0);
  const version = Number(wallet?.version ?? 0);
  const releaseAmt = Math.min(amount, held);

  const { error: ledErr } = await supabase.from("wallet_ledger").insert({
    user_id: userId,
    kind: "release",
    amount_mxn_cents: releaseAmt,
    ride_booking_id: rideBookingId,
    meta: { reason: args.reason },
  });
  if (ledErr) {
    console.warn("[rides-test-cleanup] release ledger failed", ledErr.message);
    return false;
  }

  await supabase.from("wallets").upsert(
    {
      user_id: userId,
      balance_mxn_cents: balance + releaseAmt,
      held_mxn_cents: Math.max(0, held - releaseAmt),
      version: version + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return true;
}

/** Cancel open rides for test accounts (buyer + driver) and release wallet holds. */
export async function cancelOpenTestRides(
  supabase: SupabaseClient,
  reason = "e2e_test_cleanup",
): Promise<{ cancelled: number; holdsReleased: number }> {
  const { data: open, error } = await supabase
    .from("ride_bookings")
    .select("id, buyer_id, hold_amount_mxn_cents, status, driver_id")
    .in("status", [...OPEN_STATUSES])
    .or(
      `buyer_id.in.(${DUPLICATE_TEST_IDS.join(",")}),driver_id.in.(${DUPLICATE_TEST_IDS.join(",")})`,
    );

  if (error) {
    throw new Error(`cancelOpenTestRides query failed: ${error.message}`);
  }

  let cancelled = 0;
  let holdsReleased = 0;

  for (const row of open ?? []) {
    const rideId = String(row.id);
    const { data: updated } = await supabase
      .from("ride_bookings")
      .update({
        status: "cancelled",
        cancel_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rideId)
      .in("status", [...OPEN_STATUSES])
      .select("id")
      .maybeSingle();

    if (!updated?.id) continue;
    cancelled++;

    const buyerId = String(row.buyer_id).trim();
    const holdAmount = Math.round(Number(row.hold_amount_mxn_cents ?? 0));
    if (
      holdAmount > 0 &&
      (await releaseHoldIfNeeded(supabase, {
        userId: buyerId,
        rideBookingId: rideId,
        holdAmountMxnCents: holdAmount,
        reason,
      }))
    ) {
      holdsReleased++;
    }
  }

  return { cancelled, holdsReleased };
}

export async function discoverBase(): Promise<string> {
  const explicit = process.env.RIDES_STAGING_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  for (const port of [3000, 3001, 3002, 3003]) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(5000) });
      if (r.status > 0 && r.status < 600) return base;
    } catch {
      /* try next port */
    }
  }
  throw new Error(
    "No server on :3000–3003. Start: RIDES_ENABLED=true npm run dev — or set RIDES_STAGING_BASE_URL",
  );
}
