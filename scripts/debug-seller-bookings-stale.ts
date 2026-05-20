/**
 * Debug seller bookings list vs DB truth.
 * Usage: npx tsx scripts/debug-seller-bookings-stale.ts [seller_user_id]
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getSellerAccountBookingCounts } from "../lib/seller-platform-stats";
import { mergeBookingListRowsPreferTruth, canonicalBookingRowIdKey } from "../lib/booking-list-merge";
import { idMatchVariantsForIn } from "../lib/user-id-variants";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const sellerId = process.argv[2]?.trim() || "8cb261de-e796-4db9-8d2c-f9ee97675df9";
  const poolVariants = idMatchVariantsForIn(sellerId);

  const { data: listings } = await supabase.from("listings").select("id,title_es").or(
    poolVariants.map((id) => `seller_id.eq.${id}`).join(","),
  );
  const listingIdVariants = [...new Set((listings ?? []).flatMap((l) => idMatchVariantsForIn(String(l.id))))];

  const stats = await getSellerAccountBookingCounts(supabase, poolVariants, listingIdVariants);
  console.log("STATS", stats);

  const cols =
    "id,listing_id,seller_id,status,ticket_code,paid_at,updated_at,payment_status";
  const { data: bySeller } = await supabase
    .from("service_bookings")
    .select(cols)
    .in("seller_id", poolVariants)
    .eq("payment_status", "paid");
  const { data: byList } =
    listingIdVariants.length > 0
      ? await supabase
          .from("service_bookings")
          .select(cols)
          .in("listing_id", listingIdVariants)
          .eq("payment_status", "paid")
      : { data: [] };

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(bySeller ?? []), ...(byList ?? [])]) {
    const key = canonicalBookingRowIdKey(row.id);
    const prev = merged.get(key);
    if (!prev) merged.set(key, row);
    else merged.set(key, mergeBookingListRowsPreferTruth(prev, row));
  }

  const rows = [...merged.values()].sort((a, b) => {
    const active = (s: string) => (s === "completed" || s === "cancelled" ? 1 : 0);
    const sa = String(a.status);
    const sb = String(b.status);
    if (active(sa) !== active(sb)) return active(sa) - active(sb);
    return 0;
  });

  console.log("\nMERGED_ROWS:");
  for (const r of rows) {
    console.log(
      `  ${r.ticket_code ?? "(no ticket)"}  status=${r.status}  updated=${r.updated_at}  id=${String(r.id).slice(0, 8)}…`,
    );
  }

  const ng = rows.find((r) => String(r.ticket_code).toUpperCase() === "NG-9B1C454D");
  console.log("\nNG-9B1C454D merged:", ng ? { status: ng.status, updated_at: ng.updated_at } : "NOT IN MERGE");

  const { data: activeFetch } = await supabase
    .from("service_bookings")
    .select(cols)
    .eq("payment_status", "paid")
    .in("status", ["pending", "confirmed", "scheduled", "in_progress"])
    .or(
      `seller_id.in.(${poolVariants.join(",")}),listing_id.in.(${listingIdVariants.join(",")})`,
    );
  console.log("\nACTIVE_FETCH (API qActive):", activeFetch?.length ?? 0);
  for (const r of activeFetch ?? []) {
    console.log(`  ${r.ticket_code} status=${r.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
