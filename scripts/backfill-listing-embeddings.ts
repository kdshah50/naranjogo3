/**
 * One-time / maintenance: vectorize active listings for dense hybrid search.
 *
 *   npm run backfill:listing-embeddings -- --dry-run
 *   npm run backfill:listing-embeddings -- --apply
 *   npm run backfill:listing-embeddings -- --apply --verified-only
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { embedAndStoreListing, listingEmbeddingText } from "../lib/listing-embedding";

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
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  const verifiedOnly = process.argv.includes("--verified-only");
  if (!dryRun && !apply) {
    console.error("Pass --dry-run or --apply");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let q = supabase
    .from("listings")
    .select("id,title_es,description_es,description_en,status,is_verified,embedding")
    .eq("status", "active");
  if (verifiedOnly) q = q.eq("is_verified", true);

  const { data: rows, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const need = (rows ?? []).filter((r) => r.embedding == null);
  console.log(
    `Active listings: ${rows?.length ?? 0}, missing embedding: ${need.length}${verifiedOnly ? " (verified only)" : ""}`,
  );

  if (need.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  for (const row of need) {
    const text = listingEmbeddingText(row);
    console.log(`\n${row.id.slice(0, 8)}… ${String(row.title_es ?? "").slice(0, 60)}`);
    console.log(`  text: ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`);
    if (dryRun) continue;

    const result = await embedAndStoreListing(supabase, row.id, row);
    console.log(result.ok ? `  ok (${result.dims} dims)` : `  FAIL: ${result.error}`);
    await new Promise((r) => setTimeout(r, 350));
  }

  if (apply) {
    const { count } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("embedding", "is", null);
    console.log(`\nDone. Active listings with embedding: ${count ?? "?"}`);
  } else {
    console.log("\nDry run done. Use --apply to write embeddings.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
