/**
 * Rides staging health — run before manual QA (no browser required).
 *
 *   npm run test:rides-staging          # Supabase data + driver resolution
 *   npm run test:rides-staging -- --live # + HTTP panel/online on local/preview
 *
 * Env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
 * Optional: RIDES_STAGING_DRIVER_USER_ID (default Carme canonical)
 * Live: RIDES_ENABLED=true on server; RIDES_STAGING_BASE_URL or auto localhost:3000
 */
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { isRidesEnabled } from "../lib/rides/flags";
import {
  CANONICAL_DRIVER_ID,
  DUPLICATE_TEST_IDS,
  cancelOpenTestRides,
  discoverBase,
  loadDotenv,
} from "./lib/rides-test-helpers";

const TEST_PHONE = "524151816902";
const DUPLICATE_IDS = DUPLICATE_TEST_IDS;

let failed = 0;
let warned = 0;

function fail(msg: string) {
  console.error("FAIL:", msg);
  failed++;
}

function warn(msg: string) {
  console.warn("WARN:", msg);
  warned++;
}

function ok(msg: string) {
  console.log("ok:", msg);
}

async function jwtFor(sub: string, phone: string): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET missing or too short in .env.local");
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub, phone, badge: "bronze" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(key);
}

async function main() {
  loadDotenv();
  const live = process.argv.includes("--live");
  const fix = process.argv.includes("--fix");

  console.log("=== Rides staging health ===\n");

  if (!isRidesEnabled()) {
    warn(
      "RIDES_ENABLED is not true in this shell — set RIDES_ENABLED=true for local dev / Vercel Preview",
    );
  } else {
    ok("RIDES_ENABLED=true");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local)");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (fix) {
    const cleaned = await cancelOpenTestRides(supabase, "staging_health_fix");
    ok(`--fix: cancelled ${cleaned.cancelled} open ride(s), released ${cleaned.holdsReleased} hold(s)`);
  }

  const { count: profileCount } = await supabase
    .from("driver_profiles")
    .select("user_id", { count: "exact", head: true })
    .in("user_id", DUPLICATE_IDS)
    .eq("is_active_driver", true);

  if (!profileCount || profileCount < 1) {
    fail(
      `No active driver_profiles for test IDs — run rides-restore-driver-profile.sql in Supabase`,
    );
  } else {
    ok(`active driver_profiles: ${profileCount}`);
  }

  const { data: canonicalRow } = await supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver,is_online")
    .eq("user_id", CANONICAL_DRIVER_ID)
    .maybeSingle();

  if (!canonicalRow?.is_active_driver) {
    fail(`Canonical driver ${CANONICAL_DRIVER_ID.slice(0, 8)}… missing or not active`);
  } else {
    ok(`canonical profile active (online=${canonicalRow.is_online})`);
  }

  const { data: listings } = await supabase
    .from("listings")
    .select("id,seller_id,is_verified,status,subcategory_kind")
    .in("seller_id", DUPLICATE_IDS)
    .eq("subcategory_kind", "ride")
    .eq("is_verified", true);

  if (!listings?.length) {
    fail("No verified ride listing on driver account — run rides-fix-driver-test-session.sql §3");
  } else {
    ok(`verified ride listing(s): ${listings.length}`);
  }

  const { data: poolProfiles } = await supabase
    .from("driver_profiles")
    .select("user_id,is_active_driver,is_online")
    .in("user_id", DUPLICATE_IDS)
    .eq("is_active_driver", true)
    .order("updated_at", { ascending: false });

  if (!poolProfiles?.length) {
    fail("No active driver in phone account pool (Conectar will fail)");
  } else {
    const top = poolProfiles[0]!;
    ok(`driver pool → ${String(top.user_id).slice(0, 8)}… active=${top.is_active_driver}`);
    const onCanonical = poolProfiles.some(
      (p) => String(p.user_id).toLowerCase() === CANONICAL_DRIVER_ID.toLowerCase(),
    );
    if (!onCanonical) {
      warn("Active profile is not on canonical user_id — run rides-restore-driver-profile.sql");
    }
  }

  const { count: openRides } = await supabase
    .from("ride_bookings")
    .select("id", { count: "exact", head: true })
    .in("driver_id", DUPLICATE_IDS)
    .in("status", ["matched", "accepted", "arrived", "in_trip", "requested"]);

  if (openRides && openRides > 0) {
    fail(`${openRides} open ride(s) for driver — run supabase/scripts/rides-phase0-preview-setup.sql`);
  } else {
    ok("no open rides blocking driver");
  }

  const { data: holds } = await supabase
    .from("wallet_ledger")
    .select("ride_booking_id,amount_mxn_cents,user_id")
    .eq("kind", "hold")
    .in("user_id", DUPLICATE_IDS);

  let stuckHolds = 0;
  for (const h of holds ?? []) {
    if (!h.ride_booking_id) continue;
    const { data: rel } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("ride_booking_id", h.ride_booking_id)
      .eq("kind", "release")
      .limit(1);
    if (!rel?.length) stuckHolds++;
  }
  if (stuckHolds > 0) {
    warn(`${stuckHolds} unreleased wallet hold(s) — run rides-release-buyer-wallet-holds.sql`);
  } else {
    ok("no stuck wallet holds on test accounts");
  }

  const { count: userDupes } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .or(
      `phone.eq.${TEST_PHONE},phone.eq.+${TEST_PHONE},phone.eq.5214151816902,phone.like.%4151816902%`,
    );

  if (userDupes && userDupes > 1) {
    fail(
      `${userDupes} users rows for test phone — run supabase/scripts/rides-phase0-preview-setup.sql then rides-one-driver-cleanup.sql`,
    );
  } else {
    ok(`users rows for phone: ${userDupes ?? 0}`);
  }

  if (live) {
    console.log("\n--- Live API ---");
    const base = await discoverBase();
    console.log(`Base: ${base}`);

    const token = await jwtFor(CANONICAL_DRIVER_ID, TEST_PHONE);
    const cookie = `tianguis_token=${token}`;

    const panel = await fetch(`${base}/api/rides/drivers/me/panel`, {
      headers: { Cookie: cookie, Accept: "application/json" },
      cache: "no-store",
    });
    if (panel.status === 404) {
      fail("GET panel → 404 (RIDES_ENABLED false on server or wrong URL)");
    } else if (!panel.ok) {
      fail(`GET panel → ${panel.status} ${await panel.text()}`);
    } else {
      const body = (await panel.json()) as {
        driver?: { is_active_driver?: boolean; user_id?: string };
      };
      if (!body.driver?.is_active_driver) {
        fail("GET panel: driver not active");
      } else {
        ok(`GET panel → driver ${body.driver.user_id?.slice(0, 8)}…`);
      }
    }

    const online = await fetch(`${base}/api/rides/drivers/me/online`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ online: true }),
    });
    if (!online.ok) {
      fail(`POST online → ${online.status} ${await online.text()}`);
    } else {
      ok("POST online → success (Conectar path works)");
      await fetch(`${base}/api/rides/drivers/me/online`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ online: false }),
      });
      ok("POST offline (cleanup)");
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`${failed} failure(s), ${warned} warning(s) — fix Supabase before manual test`);
    process.exit(1);
  }
  if (warned > 0) {
    console.log(`All critical checks passed with ${warned} warning(s).`);
  } else {
    console.log("All rides staging checks passed.");
  }
  if (!live) {
    console.log("Tip: npm run test:rides-staging -- --live  (with dev server running)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
