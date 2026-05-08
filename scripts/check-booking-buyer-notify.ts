/**
 * Sanity-check buyer WhatsApp readiness for lifecycle notifications (scheduled / in progress / completed prompts).
 * Does not send messages — reads Supabase only.
 *
 * Usage:
 *   npx tsx scripts/check-booking-buyer-notify.ts <booking-uuid>
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { e164DigitsForWhatsAppRecipient } from "../lib/phone";
import { expandUserAccountIdPool } from "../lib/user-account-pool";

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

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim()
  );
}

function mxVariants(digits: string): string[] {
  const v = [digits];
  if (/^52\d{10}$/.test(digits)) {
    v.push(`521${digits.slice(2)}`);
  }
  return [...new Set(v)];
}

function resolveBuyerDigits(phones: (string | null | undefined)[]): { chosen: string; pool: string[] } {
  const pool: string[] = [];
  let chosen = "";
  for (const raw of phones) {
    const d = e164DigitsForWhatsAppRecipient(raw);
    if (d) pool.push(d);
    if (!chosen && d) chosen = d;
  }
  return { chosen, pool };
}

async function main() {
  loadDotenv();
  const bookingId = process.argv[2]?.trim();
  if (!bookingId) {
    console.error(
      "Usage: npx tsx scripts/check-booking-buyer-notify.ts <booking-uuid>\nExample: checks buyer phone + Twilio env for WhatsApp notifies."
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

  const { data: booking, error: bookErr } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,seller_id,listing_id,status,payment_status,ticket_code")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookErr || !booking) {
    console.error("Booking not found or query error:", bookErr?.message ?? bookErr);
    process.exit(1);
  }

  const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  const { data: buyerRows } = buyerPool.length
    ? await supabase.from("users").select("id,display_name,phone").in("id", buyerPool)
    : { data: [] as { id: string; display_name: string | null; phone: string | null }[] };

  const phones = (buyerRows ?? []).map((r) => r.phone);
  const { chosen, pool } = resolveBuyerDigits(phones);

  console.log("\n=== Booking buyer notify check (dry run) ===\n");
  console.log("booking_id:", booking.id);
  console.log("status:", booking.status, "| payment:", booking.payment_status);
  console.log("ticket_code:", booking.ticket_code ?? "(none yet)");
  console.log("TWILIO_* configured:", twilioConfigured() ? "yes" : "NO — WhatsApp sends will not leave the server");
  console.log("buyer_id (row):", booking.buyer_id);
  console.log("merged account pool size:", buyerPool.length);
  if ((buyerRows ?? []).length) {
    for (const r of buyerRows ?? []) {
      const d = e164DigitsForWhatsAppRecipient(r.phone);
      console.log(
        `  user ${r.id.slice(0, 8)}… display="${(r.display_name ?? "").slice(0, 40)}" phone→digits=${d || "(empty / not E.164)"}`
      );
    }
  }
  console.log("\nResolved WhatsApp target (first valid E.164 digits in pool):", chosen || "NONE — notify will fail with no_buyer_phone");
  if (chosen) {
    console.log("MX mobile variants attempted by app (+52/+521 trick):", mxVariants(chosen).join(", "));
  }

  console.log("\n--- How to verify a real send (you as seller) ---");
  console.log(
    "1) Open seller bookings, change estado (scheduled → in_progress → completed).\n" +
      "2) DevTools → Network → PATCH …/api/bookings/<id> → Response JSON:\n" +
      "     buyerPhaseWhatsApp: { delivered: true }  → Twilio accepted the HTTPS request.\n" +
      "     delivered: false + reason → see readme / logs (twilio_unconfigured, no_buyer_phone, send_failed, deduped).\n" +
      "3) Twilio Console → Monitor → Logs → Messaging — confirm outbound to whatsapp:+…\n" +
      "4) Sandbox: recipient must reply JOIN to your sandbox number once.\n"
  );
}

void main();
