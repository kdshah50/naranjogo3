/**
 * One-time (or maintenance): merge duplicate `users` rows that share the same phone.
 *
 *   npm run test:user-phone-uniqueness          # report duplicate groups
 *   npm run merge:duplicate-users -- --dry-run  # preview merges
 *   npm run merge:duplicate-users -- --apply    # merge + normalize phones
 *
 * After merge, apply migration 20260528120000_users_phone_unique_canonical.sql in Supabase.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { mergeUserAccountInto } from "../lib/merge-duplicate-users-server";
import { phoneIdentityKey, storageAuthPhone } from "../lib/phone";
import {
  findDuplicatePhoneGroups,
  pickLoginUserForPhone,
  type LoginUserRow,
} from "../lib/resolve-login-user";

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

type UserPhoneRow = { id: string; phone: string | null };

async function normalizeAllPhones(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("users").select("id,phone").not("phone", "is", null);
  if (error) throw error;
  const rows = (data ?? []) as UserPhoneRow[];
  let updated = 0;
  for (const row of rows) {
    const raw = String(row.phone ?? "");
    const canonical = storageAuthPhone(raw);
    if (!canonical || canonical === raw) continue;
    const { error: upErr } = await supabase.from("users").update({ phone: canonical }).eq("id", row.id);
    if (!upErr) updated++;
  }
  return updated;
}

async function main() {
  loadDotenv();
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (!dryRun && !apply) {
    console.error("Pass --dry-run or --apply");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log("=== Normalize phones to canonical E.164 (no +) ===\n");
  if (apply) {
    const n = await normalizeAllPhones(supabase);
    console.log(`Updated ${n} row(s) to canonical phone format.\n`);
  } else {
    console.log("(skipped — use --apply to normalize)\n");
  }

  const groups = await findDuplicatePhoneGroups(supabase);
  if (groups.size === 0) {
    console.log("No duplicate phone groups found.");
    process.exit(0);
  }

  console.log(`Found ${groups.size} duplicate phone group(s):\n`);

  for (const [phoneKey, rows] of groups) {
    const canonical = await pickLoginUserForPhone(supabase, phoneKey);
    if (!canonical) continue;
    console.log(`Phone ${phoneKey} → keep ${canonical.id} (${canonical.display_name ?? "no name"})`);
    for (const row of rows) {
      const tag = row.id === canonical.id ? "KEEP" : "MERGE";
      console.log(
        `  [${tag}] ${row.id.slice(0, 8)}… verified=${Boolean(row.phone_verified)} name=${row.display_name ?? "—"} stored=${row.phone}`,
      );
    }
    console.log("");

    if (!apply) continue;

    for (const row of rows) {
      if (row.id === canonical.id) continue;
      console.log(`Merging ${row.id.slice(0, 8)}… into ${canonical.id.slice(0, 8)}…`);
      await mergeUserAccountInto(supabase, row.id, canonical.id);
    }

    await supabase
      .from("users")
      .update({ phone: phoneKey, phone_verified: true })
      .eq("id", canonical.id);
  }

  if (apply) {
    const after = await findDuplicatePhoneGroups(supabase);
    if (after.size > 0) {
      console.error(`${after.size} duplicate group(s) remain — resolve manually before UNIQUE migration.`);
      process.exit(1);
    }
    console.log("Merge complete. Safe to run users_phone_unique migration.");
  } else {
    console.log("Dry run done.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
