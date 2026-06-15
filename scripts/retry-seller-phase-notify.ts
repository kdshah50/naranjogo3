/**
 * Re-send provider WhatsApp for scheduled / in_progress lifecycle phase.
 *
 * Usage:
 *   npx tsx scripts/retry-seller-phase-notify.ts NG-00FDB90F scheduled
 *   npx tsx scripts/retry-seller-phase-notify.ts <booking-uuid> in_progress --force
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { notifySellerLifecyclePhase } from "../lib/seller-phase-notify";
import { phoneDigitsForAccountPool } from "../lib/user-phone-notify";
import { e164DigitsForWhatsAppRecipient } from "../lib/phone";

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
  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");
  const ref = args[0]?.trim();
  const phase = (args[1]?.trim() ?? "scheduled") as "scheduled" | "in_progress";
  if (!ref || (phase !== "scheduled" && phase !== "in_progress")) {
    console.error(
      "Usage: npx tsx scripts/retry-seller-phase-notify.ts <ticket-or-uuid> [scheduled|in_progress] [--force]",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const isUuid = /^[0-9a-f-]{36}$/i.test(ref);
  const { data: booking, error } = isUuid
    ? await supabase
        .from("service_bookings")
        .select("id,ticket_code,status,payment_status,seller_id,seller_phone_snapshot")
        .eq("id", ref)
        .maybeSingle()
    : await supabase
        .from("service_bookings")
        .select("id,ticket_code,status,payment_status,seller_id,seller_phone_snapshot")
        .eq("ticket_code", ref.toUpperCase())
        .maybeSingle();

  if (error || !booking) {
    console.error("Booking not found:", error?.message ?? ref);
    process.exit(1);
  }

  const snapshotDigits = e164DigitsForWhatsAppRecipient(String(booking.seller_phone_snapshot ?? ""));
  const poolDigits = await phoneDigitsForAccountPool(supabase, String(booking.seller_id));
  console.log("\n=== Retry seller lifecycle WhatsApp ===\n");
  console.log("booking_id:", booking.id);
  console.log("ticket:", booking.ticket_code);
  console.log("status:", booking.status);
  console.log("phase:", phase);
  console.log("seller_phone_snapshot → digits:", snapshotDigits || "(empty)");
  console.log("seller account pool → digits:", poolDigits || "(empty)");

  if (force) {
    await supabase
      .from("booking_events")
      .delete()
      .eq("booking_id", booking.id)
      .eq("event_type", "seller_whatsapp_phase")
      .eq("to_status", phase);
    console.log("\n--force: cleared seller_whatsapp_phase dedupe event.");
  }

  const result = await notifySellerLifecyclePhase(supabase, String(booking.id), phase);
  console.log("\nResult:", result);
}

void main();
