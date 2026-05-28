/**
 * Preflight: fail if duplicate phone groups exist (run before deploy / after merge).
 *
 *   npm run test:user-phone-uniqueness
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { findDuplicatePhoneGroups, pickLoginUserForPhone } from "../lib/resolve-login-user";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const groups = await findDuplicatePhoneGroups(supabase);

  if (groups.size === 0) {
    console.log("ok: one user row per phone (no duplicate groups).");
    process.exit(0);
  }

  console.error(`FAIL: ${groups.size} duplicate phone group(s):`);
  for (const [phoneKey, rows] of groups) {
    const keep = await pickLoginUserForPhone(supabase, phoneKey);
    console.error(`  ${phoneKey} (${rows.length} rows) → should keep ${keep?.id ?? "?"}`);
    for (const r of rows) {
      console.error(`    - ${r.id} ${r.display_name ?? ""} stored=${r.phone}`);
    }
  }
  console.error("\nRun: npm run merge:duplicate-users -- --apply");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
