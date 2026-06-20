/**
 * Re-send provider WhatsApp after deposit payment (e.g. Twilio format bug or missing phone lookup).
 *
 * Usage:
 *   npx tsx scripts/retry-seller-booking-notify.ts NG-00FDB90F
 *   npx tsx scripts/retry-seller-booking-notify.ts <booking-uuid>
 *   npx tsx scripts/retry-seller-booking-notify.ts NG-00FDB90F --force
 *
 * --force clears seller_booking_paid_notified_at so notify can run again (only if you know WhatsApp never arrived).
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWILIO_* in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { notifySellerBookingCommissionPaid } from "../lib/seller-booking-notify";
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
  if (!ref) {
    console.error(
      "Usage: npx tsx scripts/retry-seller-booking-notify.ts <ticket-code-or-booking-uuid> [--force]",
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
        .select(
          "id,ticket_code,payment_status,seller_id,seller_phone_snapshot,seller_booking_paid_notified_at,seller_booking_paid_notify_claimed_at",
        )
        .eq("id", ref)
        .maybeSingle()
    : await supabase
        .from("service_bookings")
        .select(
          "id,ticket_code,payment_status,seller_id,seller_phone_snapshot,seller_booking_paid_notified_at,seller_booking_paid_notify_claimed_at",
        )
        .eq("ticket_code", ref.toUpperCase())
        .maybeSingle();

  if (error || !booking) {
    console.error("Booking not found:", error?.message ?? ref);
    process.exit(1);
  }

  if (booking.payment_status !== "paid") {
    console.error("Booking is not paid yet — payment_status:", booking.payment_status);
    process.exit(1);
  }

  const snapshotDigits = e164DigitsForWhatsAppRecipient(String(booking.seller_phone_snapshot ?? ""));
  const poolDigits = await phoneDigitsForAccountPool(supabase, String(booking.seller_id));
  console.log("\n=== Retry seller booking WhatsApp ===\n");
  console.log("booking_id:", booking.id);
  console.log("ticket_code:", booking.ticket_code);
  console.log("seller_booking_paid_notified_at:", booking.seller_booking_paid_notified_at ?? "(null)");
  console.log("seller_phone_snapshot → digits:", snapshotDigits || "(empty)");
  console.log("seller account pool → digits:", poolDigits || "(empty)");

  if (booking.seller_booking_paid_notified_at && !force) {
    console.error(
      "\nAlready marked notified. If WhatsApp never arrived, re-run with --force to clear and retry.",
    );
    process.exit(1);
  }

  if (force && booking.seller_booking_paid_notified_at) {
    await supabase
      .from("service_bookings")
      .update({
        seller_booking_paid_notified_at: null,
        seller_booking_paid_notify_claimed_at: null,
      })
      .eq("id", booking.id);
    console.log("\n--force: cleared notified/claimed timestamps.");
  } else if (booking.seller_booking_paid_notify_claimed_at) {
    await supabase
      .from("service_bookings")
      .update({ seller_booking_paid_notify_claimed_at: null })
      .eq("id", booking.id);
    console.log("\nCleared stale notify claim.");
  }

  console.log("\nCalling notifySellerBookingCommissionPaid…");
  await notifySellerBookingCommissionPaid(supabase, String(booking.id));

  const { data: after } = await supabase
    .from("service_bookings")
    .select("seller_booking_paid_notified_at")
    .eq("id", booking.id)
    .maybeSingle();

  if (after?.seller_booking_paid_notified_at) {
    console.log("Done — seller_booking_paid_notified_at set at", after.seller_booking_paid_notified_at);
  } else {
    console.log(
      "Notify did not complete (no phone, Twilio failure, or claim lost). Check server logs / Twilio console.",
    );
  }
}

void main();
