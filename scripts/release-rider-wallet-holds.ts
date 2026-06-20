/**
 * Release unreleased ride wallet holds for a buyer (preview/staging cleanup).
 *
 *   npm run release:rider-holds -- 17326908527
 *   npm run release:rider-holds -- 8ce0201b-da82-46ce-8af3-3432a2f66b79
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

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

async function main() {
  loadDotenv();
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error("Usage: npm run release:rider-holds -- <phone or user_id>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let userId = arg;
  if (!arg.includes("-")) {
    const digits = arg.replace(/\D/g, "");
    const { data: users } = await supabase.from("users").select("id,phone").or(`phone.eq.${digits},phone.eq.+${digits}`);
    if (!users?.length) {
      console.error("No user for phone", arg);
      process.exit(1);
    }
    userId = users[0]!.id;
  }

  const { data: walletBefore } = await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents")
    .eq("user_id", userId)
    .maybeSingle();
  console.log("Before:", walletBefore);

  const { data: holds } = await supabase
    .from("wallet_ledger")
    .select("ride_booking_id,amount_mxn_cents")
    .eq("user_id", userId)
    .eq("kind", "hold");

  let released = 0;
  for (const h of holds ?? []) {
    if (!h.ride_booking_id) continue;
    const { data: rel } = await supabase
      .from("wallet_ledger")
      .select("id")
      .eq("ride_booking_id", h.ride_booking_id)
      .eq("kind", "release")
      .limit(1);
    if (rel?.length) continue;

    const amount = Math.round(Number(h.amount_mxn_cents));
    const { data: w } = await supabase
      .from("wallets")
      .select("balance_mxn_cents,held_mxn_cents,version")
      .eq("user_id", userId)
      .single();
    const balance = Number(w?.balance_mxn_cents ?? 0);
    const held = Number(w?.held_mxn_cents ?? 0);
    const version = Number(w?.version ?? 0);
    const releaseAmt = Math.min(amount, held);

    const { error: insErr } = await supabase.from("wallet_ledger").insert({
      user_id: userId,
      kind: "release",
      amount_mxn_cents: releaseAmt,
      ride_booking_id: h.ride_booking_id,
      meta: { reason: "release_rider_holds_script" },
    });
    if (insErr) {
      console.error("release insert failed", h.ride_booking_id, insErr.message);
      continue;
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
    released++;
    console.log("released", h.ride_booking_id, releaseAmt, "cents");
  }

  const { data: walletAfter } = await supabase
    .from("wallets")
    .select("balance_mxn_cents,held_mxn_cents")
    .eq("user_id", userId)
    .maybeSingle();
  console.log(`Done: ${released} hold(s) released.`);
  console.log("After:", walletAfter);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
