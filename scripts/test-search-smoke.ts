/**
 * Hybrid search smoke tests — run after deploy or when changing search/embeddings.
 *
 *   npm run test:search-smoke
 *   SEARCH_SMOKE_BASE_URL=http://127.0.0.1:3000 npm run test:search-smoke
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Optional: SEARCH_SMOKE_BASE_URL (default NEXT_PUBLIC_APP_URL or https://naranjogo.com.mx)
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

type SearchPayload = {
  results?: { title_es?: string }[];
  mode?: string;
  total?: number;
  debug?: {
    hasOpenAIKey?: boolean;
    sparseCount?: number;
    denseCount?: number;
    denseFilter?: { rejectedNoSparseMatch?: boolean };
    vercelGitSha?: string | null;
  };
};

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg: string) {
  console.log(`ok: ${msg}`);
}

async function fetchSearch(base: string, q: string): Promise<SearchPayload> {
  const params = new URLSearchParams({ q, category: "services" });
  const url = `${base.replace(/\/$/, "")}/api/search?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) fail(`GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as SearchPayload;
}

async function checkEmbeddingCoverage(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) fail("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await supabase
    .from("listings")
    .select("id,embedding")
    .eq("status", "active")
    .eq("is_verified", true)
    .eq("category_id", "services");

  if (error) fail(`Supabase listings check: ${error.message}`);

  const total = rows?.length ?? 0;
  const missing = (rows ?? []).filter((r) => r.embedding == null).length;
  if (total === 0) {
    ok("embedding coverage — no verified service listings (skip vector check)");
    return;
  }
  if (missing > 0) {
    fail(`${missing}/${total} verified service listing(s) missing embedding — run embed-backfill`);
  }
  ok(`embedding coverage — ${total}/${total} verified services have vectors`);
}

async function main() {
  loadDotenv();

  const base =
    process.env.SEARCH_SMOKE_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://naranjogo.com.mx";

  console.log(`Search smoke → ${base}\n`);

  await checkEmbeddingCoverage();

  const cooking = await fetchSearch(base, "cooking lady under $600");
  if ((cooking.total ?? 0) < 1) {
    fail('query "cooking lady under $600" returned 0 results (expected chef listing)');
  }
  const titles = (cooking.results ?? []).map((r) => String(r.title_es ?? "").toLowerCase());
  if (!titles.some((t) => t.includes("chef") || t.includes("cocin"))) {
    fail(`cooking query missing chef/cocina in titles: ${titles.join(", ") || "(none)"}`);
  }
  if (cooking.mode !== "hybrid") {
    fail(`cooking query mode=${cooking.mode ?? "?"} (expected hybrid)`);
  }
  if ((cooking.debug?.sparseCount ?? 0) < 1) {
    fail(`cooking query sparseCount=${cooking.debug?.sparseCount ?? 0} (expected ≥ 1)`);
  }
  if ((cooking.debug?.denseCount ?? 0) < 1) {
    fail(`cooking query denseCount=${cooking.debug?.denseCount ?? 0} (expected ≥ 1)`);
  }
  if (!cooking.debug?.hasOpenAIKey) {
    fail("search API reports hasOpenAIKey=false on server");
  }
  ok(`cooking + price → hybrid (${cooking.total} hit(s), sparse+dense)`);

  const teeth = await fetchSearch(base, "I need to fix my teeth");
  if ((teeth.total ?? 0) !== 0) {
    const got = (teeth.results ?? []).map((r) => r.title_es).join("; ");
    fail(`dental query with no dentists should return 0 results, got ${teeth.total}: ${got}`);
  }
  ok('no-dentist query → empty (no unrelated services)');

  const sha = cooking.debug?.vercelGitSha;
  if (sha) console.log(`\nDeployed git sha (from search debug): ${sha.slice(0, 7)}`);

  console.log("\nAll search smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
