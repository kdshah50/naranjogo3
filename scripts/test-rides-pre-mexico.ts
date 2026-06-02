/**
 * Pre-Mexico QA gate — run everything before manual phone testing.
 *
 *   npm run test:rides-pre-mexico
 *   RIDES_STAGING_BASE_URL=https://your-preview.vercel.app npm run test:rides-pre-mexico
 *
 * Requires: .env.local (Supabase + JWT_SECRET), dev server or preview with RIDES_ENABLED=true.
 */
import { execSync } from "child_process";
import {
  cancelOpenTestRides,
  createTestSupabase,
  discoverBase,
  loadDotenv,
} from "./lib/rides-test-helpers";

function run(label: string, script: string, extraArgs = "") {
  console.log(`\n--- ${label} ---\n`);
  execSync(`npx tsx ${script} ${extraArgs}`.trim(), {
    stdio: "inherit",
    env: { ...process.env, RIDES_ENABLED: "true" },
  });
}

async function main() {
  loadDotenv();
  console.log("=== Pre-Mexico rides QA gate ===");
  console.log("(Unit tests → Supabase cleanup → staging health → full E2E)\n");

  run("Unit: ride lifecycle", "scripts/test-ride-lifecycle.ts");
  run("Unit: ride pricing", "scripts/test-ride-pricing.ts");
  run("Unit: driver onboarding", "scripts/test-driver-onboarding.ts");

  console.log("\n--- Supabase cleanup (test accounts) ---\n");
  const supabase = createTestSupabase();
  const cleaned = await cancelOpenTestRides(supabase, "pre_mexico_qa_cleanup");
  console.log(
    `ok: cancelled ${cleaned.cancelled} open ride(s), released ${cleaned.holdsReleased} wallet hold(s)`,
  );

  const base = await discoverBase();
  process.env.RIDES_STAGING_BASE_URL = base;
  console.log(`\nok: API base ${base}`);

  run("Staging health (live API)", "scripts/test-rides-staging-health.ts", "--live");
  run("Full E2E lifecycle", "scripts/test-rides-full-e2e.ts");

  console.log("\n✅ Pre-Mexico QA gate passed — safe to engage manual tester.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
