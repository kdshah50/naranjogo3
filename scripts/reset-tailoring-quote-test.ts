/**
 * Reset tailoring quote/chat state for production E2E testing.
 *
 *   npx tsx scripts/reset-tailoring-quote-test.ts --dry-run
 *   npx tsx scripts/reset-tailoring-quote-test.ts --listing-id=<uuid> --dry-run
 *   npx tsx scripts/reset-tailoring-quote-test.ts --listing-id=<uuid> --execute
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { executeQuoteTestReset, previewQuoteTestReset } from "../lib/admin-reset-quote-test";

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

async function main() {
  loadDotenv();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--execute");
  const listingId = args.find((a) => a.startsWith("--listing-id="))?.split("=")[1]?.trim();
  const buyerId = args.find((a) => a.startsWith("--buyer-id="))?.split("=")[1]?.trim();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const opts = { listingId, buyerId };

  const preview = await previewQuoteTestReset(supabase, opts);
  console.log(JSON.stringify({ dryRun, ...preview }, null, 2));

  if (dryRun) {
    console.log("\nRe-run with --execute to apply (add --listing-id=... to scope one shop).");
    return;
  }

  if (preview.listingIds.length === 0) {
    console.log("No tailoring listings matched — nothing to reset.");
    return;
  }

  await executeQuoteTestReset(supabase, opts);
  const after = await previewQuoteTestReset(supabase, opts);
  console.log("\nAfter reset:", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
