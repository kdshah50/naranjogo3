/**
 * Full rides E2E (API) — estimate → request → match → accept → cancel cleanup.
 *
 *   npm run test:rides-full
 *   RIDES_STAGING_BASE_URL=https://your-preview.vercel.app npm run test:rides-full
 *
 * Requires: .env.local with Supabase, JWT_SECRET, RIDES_ENABLED=true on server.
 * Optional: INTERNAL_API_SECRET (for explicit match fallback).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WalletBalanceRow = {
  balance_mxn_cents: number;
  held_mxn_cents: number;
};
import { SignJWT } from "jose";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { internalSecretHeaders } from "../lib/rides/internal-auth";

const CANONICAL_ID =
  process.env.RIDES_STAGING_DRIVER_USER_ID?.trim() ||
  "3d5522b3-aedf-4625-80a1-8a79708bb893";
const TEST_PHONE = "524151816902";

let failed = 0;

function fail(msg: string) {
  console.error("FAIL:", msg);
  failed++;
}

function ok(msg: string) {
  console.log("ok:", msg);
}

function loadDotenv() {
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

async function discoverBase(): Promise<string> {
  const explicit = process.env.RIDES_STAGING_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  for (const port of [3000, 3001, 3002]) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(5000) });
      if (r.status > 0 && r.status < 600) return base;
    } catch {
      /* next */
    }
  }
  throw new Error(
    "No server. Set RIDES_STAGING_BASE_URL to your Vercel preview, or run RIDES_ENABLED=true npm run dev",
  );
}

async function jwtFor(sub: string, phone: string): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET missing in .env.local");
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub, phone, badge: "bronze" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(key);
}

/** Ensure canonical test account can request a ride (preview E2E only). */
async function ensureTestBalance(
  supabase: SupabaseClient,
  userId: string,
  minCents: number,
): Promise<void> {
  const { data: w } = (await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents")
    .eq("user_id", userId)
    .maybeSingle()) as { data: WalletBalanceRow | null };

  const balance = Number(w?.balance_mxn_cents ?? 0);
  const held = Number(w?.held_mxn_cents ?? 0);
  if (balance >= minCents) return;

  const topUp = Math.max(minCents, 70000) - balance;
  const { error: ledErr } = await supabase.from("wallet_ledger").insert({
    user_id: userId,
    kind: "adjustment",
    amount_mxn_cents: topUp,
    meta: { reason: "rides_e2e_test_credit" },
  });
  if (ledErr) throw new Error(`E2E wallet credit failed: ${ledErr.message}`);

  const newBalance = balance + topUp;
  const { error: upErr } = await supabase.from("wallets").upsert(
    {
      user_id: userId,
      balance_mxn_cents: newBalance,
      held_mxn_cents: held,
      version: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upErr) throw new Error(`E2E wallet upsert failed: ${upErr.message}`);
  ok(`E2E credited $${(topUp / 100).toFixed(2)} (test balance for canonical user)`);
}

async function api(
  base: string,
  path: string,
  opts: {
    method?: string;
    cookie?: string;
    body?: unknown;
    internal?: boolean;
  } = {},
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    ...(opts.internal ? internalSecretHeaders() : {}),
  };
  const r = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { status: r.status, data, ok: r.ok };
}

async function main() {
  loadDotenv();
  console.log("=== Rides full E2E (API) ===\n");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const base = await discoverBase();
  console.log(`Base: ${base}\n`);

  const token = await jwtFor(CANONICAL_ID, TEST_PHONE);
  const cookie = `tianguis_token=${token}`;

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  await ensureTestBalance(supabase, CANONICAL_ID, 10000);

  // Cancel leftover E2E rides
  await supabase
    .from("ride_bookings")
    .update({ status: "cancelled", cancel_reason: "e2e_test_cleanup", updated_at: new Date().toISOString() })
    .eq("buyer_id", CANONICAL_ID)
    .in("status", ["requested", "matched", "accepted", "arrived", "in_trip"]);

  // 1) Wallet
  const wallet = await api(base, "/api/rides/wallet", { cookie });
  if (wallet.status === 404) {
    fail("GET /api/rides/wallet → 404 (RIDES_ENABLED=false on this deployment)");
    process.exit(1);
  }
  const { data: wRow } = (await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents")
    .eq("user_id", CANONICAL_ID)
    .maybeSingle()) as { data: WalletBalanceRow | null };
  const dbBal = Number(wRow?.balance_mxn_cents ?? 0);
  const dbHeld = Number(wRow?.held_mxn_cents ?? 0);
  ok(`wallet (DB) balance=$${(dbBal / 100).toFixed(2)} held=$${(dbHeld / 100).toFixed(2)}`);
  if (!wallet.ok) warn(`GET /api/rides/wallet → ${wallet.status}`);
  if (dbBal < 5000) fail("Balance < $50 MXN after E2E credit");

  // 2) Driver online
  const on = await api(base, "/api/rides/drivers/me/online", {
    method: "POST",
    cookie,
    body: { online: true, lat: 20.915, lng: -100.745 },
  });
  if (!on.ok) {
    fail(`POST driver online → ${on.status} ${JSON.stringify(on.data)}`);
    process.exit(1);
  }
  ok("driver online + GPS ping");

  // 3) Fare estimate
  const est = await api(base, "/api/rides/pricing/estimate", {
    method: "POST",
    cookie,
    body: {
      pickup_colonia: "centro",
      dropoff_colonia: "guadalupe",
      pickup_address: "Centro test",
      dropoff_address: "Guadalupe test",
    },
  });
  if (!est.ok) {
    fail(`POST estimate → ${est.status} ${JSON.stringify(est.data)}`);
  } else {
    const estimate = (est.data as { estimate?: { estimated_total_mxn_cents?: number } }).estimate;
    const total = Number(estimate?.estimated_total_mxn_cents ?? 0);
    ok(`estimate fare=$${(total / 100).toFixed(2)}`);
  }

  // 4) Request ride
  const req = await api(base, "/api/rides/request", {
    method: "POST",
    cookie,
    body: {
      pickup_colonia: "centro",
      dropoff_colonia: "guadalupe",
      pickup_address: "Centro E2E test",
      dropoff_address: "Guadalupe E2E test",
      passengers: 1,
      auto_match: true,
    },
  });
  if (!req.ok) {
    fail(`POST request → ${req.status} ${JSON.stringify(req.data)}`);
    process.exit(1);
  }

  const ride = (req.data as { ride?: { id?: string; status?: string; ticket_code?: string } }).ride;
  const rideId = String(ride?.id ?? "");
  if (!rideId) {
    fail("POST request: no ride.id in response");
    process.exit(1);
  }
  ok(`ride created ${rideId.slice(0, 8)}… status=${ride?.status} ticket=${ride?.ticket_code ?? "—"}`);

  let status = String(ride?.status ?? "requested");

  if (status === "requested") {
    const internal = Boolean(process.env.INTERNAL_API_SECRET?.trim());
    if (internal) {
      const m = await api(base, `/api/rides/${rideId}/match`, {
        method: "POST",
        internal: true,
        body: { pickup_colonia: "centro", driver_user_id: CANONICAL_ID },
      });
      if (m.ok) {
        status = String((m.data as { ride?: { status?: string } }).ride?.status ?? "matched");
        ok(`internal match → ${status}`);
      } else {
        fail(`match → ${m.status} ${JSON.stringify(m.data)}`);
      }
    } else {
      warn("ride still requested — set INTERNAL_API_SECRET for match fallback or wait for dispatch");
    }
  }

  if (status !== "matched") {
    const { data: row } = await supabase
      .from("ride_bookings")
      .select("status,driver_id")
      .eq("id", rideId)
      .maybeSingle();
    status = String(row?.status ?? status);
    if (status === "matched") ok(`DB status matched (driver ${String(row?.driver_id ?? "").slice(0, 8)}…)`);
    else fail(`expected matched, got ${status}`);
  } else {
    ok("ride matched to driver");
  }

  // 5) Driver panel sees trip
  const panel = await api(base, "/api/rides/drivers/me/panel", { cookie });
  if (!panel.ok) {
    fail(`GET panel → ${panel.status}`);
  } else {
    const trips = (panel.data as { trips?: { id: string }[] }).trips ?? [];
    const found = trips.some((t) => t.id === rideId);
    if (!found) fail(`panel trips (${trips.length}) missing new ride`);
    else ok(`panel lists ${trips.length} trip(s) including new ride`);
  }

  // 6) Accept
  if (status === "matched") {
    const acc = await api(base, `/api/rides/${rideId}/accept`, {
      method: "POST",
      cookie,
    });
    if (!acc.ok) {
      fail(`POST accept → ${acc.status} ${JSON.stringify(acc.data)}`);
    } else {
      const st = String((acc.data as { ride?: { status?: string } }).ride?.status ?? "");
      if (st === "accepted") ok("driver accepted ride");
      else fail(`accept returned status ${st}`);
    }
  }

  // 7) Cleanup — cancel + offline
  const cancel = await api(base, `/api/rides/${rideId}/cancel`, {
    method: "POST",
    cookie,
    body: { reason: "e2e_test_cleanup" },
  });
  if (!cancel.ok) {
    warn(`cancel cleanup → ${cancel.status} (may need SQL)`);
  } else {
    ok("ride cancelled (cleanup)");
  }

  await api(base, "/api/rides/drivers/me/online", {
    method: "POST",
    cookie,
    body: { online: false },
  });
  ok("driver offline (cleanup)");

  console.log("");
  if (failed > 0) {
    console.error(`${failed} failure(s) — see above`);
    process.exit(1);
  }
  console.log("Full rides E2E passed.");
}

function warn(msg: string) {
  console.warn("WARN:", msg);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
