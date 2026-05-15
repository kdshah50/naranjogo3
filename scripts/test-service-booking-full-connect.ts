/**
 * Service booking — full_connect flow tests.
 *
 * 1) Default: deterministic "pricing + lifecycle" checks (no network, no Stripe).
 *    Mirrors app/api/bookings/checkout/route.ts full_connect math via shared libs.
 *
 * 2) Optional live smoke: starts real Checkout Session (Stripe test mode) against a running app.
 *    Requires: dev server, .env with Supabase + Stripe test keys + Connect seller on the listing.
 *
 * Usage:
 *   npm run test:full-connect
 *   npm run test:full-connect -- --live
 *
 * Live env (in addition to NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + JWT_SECRET + STRIPE_SECRET_KEY):
 *   BOOKING_E2E_BASE_URL   (default: probe 127.0.0.1:3000–3005 like test:messaging)
 *   BOOKING_E2E_LISTING_ID  active services listing UUID
 *   BOOKING_E2E_BUYER_ID    user id (JWT sub); must not be the listing seller
 *
 * Before --live: seller must have users.stripe_connect_account_id = acct_… and buyer must pass
 * contact gate (this script upserts contacted_in_app = true for buyer+listing).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";
import {
  computeCartPricing,
  applyLoyaltyDiscountToCartPricing,
  marketplaceApplicationFeeCents,
  getMarketplaceVatPercent,
} from "@/lib/marketplace-cart-pricing";
import { resolveServicePricingBaseMxnCents } from "@/lib/service-booking-pricing";
import { statusAfterPaymentSucceeded } from "@/lib/booking-lifecycle";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";
import { isServicesListing } from "@/lib/listing-category";
import { MIN_COMMISSION_CENTS_MXN } from "@/lib/stripe";

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

function buildFullConnectSnapshot(args: {
  pricingBase: number;
  commissionPct: number;
  loyaltyDiscountPct: number;
  titleEs: string;
  listingId: string;
}) {
  let cartP = computeCartPricing([
    {
      listingId: args.listingId,
      qty: 1,
      unitPriceMxnCents: args.pricingBase,
      commissionPct: args.commissionPct,
      titleEs: args.titleEs,
    },
  ]);
  const commBefore = cartP.commissionCents;
  if (args.loyaltyDiscountPct > 0) {
    cartP = applyLoyaltyDiscountToCartPricing(cartP, args.loyaltyDiscountPct);
  }
  const loyaltyDiscount = Math.max(0, commBefore - cartP.commissionCents);
  const applicationFeeCents = marketplaceApplicationFeeCents(cartP);
  const stripeLineSum = cartP.subtotalCents + cartP.commissionCents + cartP.vatCents;
  return { cartP, applicationFeeCents, stripeLineSum, loyaltyDiscount };
}

function runUnitTests() {
  process.env.MARKETPLACE_VAT_PERCENT = "16";

  const baseFromListing = resolveServicePricingBaseMxnCents({
    listing: {
      price_mxn: 50_000,
      package_session_count: null,
      package_total_price_mxn: null,
    },
    gate: null,
  });
  assert.equal(baseFromListing, 50_000, "listing-only pricing base (centavos)");

  const agreedAt = new Date().toISOString();
  const baseFromGate = resolveServicePricingBaseMxnCents({
    listing: {
      price_mxn: 50_000,
      package_session_count: null,
      package_total_price_mxn: null,
    },
    gate: {
      agreed_subtotal_mxn_cents: 120_000,
      seller_set_agreed_price_at: agreedAt,
    },
  });
  assert.equal(baseFromGate, 120_000, "agreed gate overrides list price");

  const pricingBase = 250_000; // 2,500 MXN
  const commissionPct = 10;

  const snap0 = buildFullConnectSnapshot({
    pricingBase,
    commissionPct,
    loyaltyDiscountPct: 0,
    titleEs: "Unit test service",
    listingId: "00000000-0000-0000-0000-000000000001",
  });

  assert.equal(snap0.cartP.subtotalCents, pricingBase);
  assert.equal(snap0.cartP.commissionCents, 25_000);
  assert.equal(snap0.applicationFeeCents, snap0.cartP.commissionCents + snap0.cartP.vatCents);
  assert.equal(snap0.stripeLineSum, snap0.cartP.totalCents);
  assert(snap0.applicationFeeCents > snap0.cartP.commissionCents, "application fee includes IVA");

  const snapLoyalty = buildFullConnectSnapshot({
    pricingBase,
    commissionPct,
    loyaltyDiscountPct: 20,
    titleEs: "Loyalty",
    listingId: "00000000-0000-0000-0000-000000000002",
  });
  assert(snapLoyalty.cartP.commissionCents >= MIN_COMMISSION_CENTS_MXN, "min commission after loyalty");
  assert(snapLoyalty.loyaltyDiscount > 0);
  assert.equal(
    marketplaceApplicationFeeCents(snapLoyalty.cartP),
    snapLoyalty.cartP.commissionCents + snapLoyalty.cartP.vatCents
  );

  const smallBase = 5_000; // 50 MXN, 10% = 500 raw < min
  const snapMin = buildFullConnectSnapshot({
    pricingBase: smallBase,
    commissionPct: 10,
    loyaltyDiscountPct: 0,
    titleEs: "Min commission",
    listingId: "00000000-0000-0000-0000-000000000003",
  });
  assert.equal(snapMin.cartP.commissionCents, MIN_COMMISSION_CENTS_MXN);

  assert.equal(statusAfterPaymentSucceeded("pending"), "confirmed");
  assert.equal(statusAfterPaymentSucceeded("scheduled"), "scheduled");

  const vat = getMarketplaceVatPercent();
  assert.ok(Number.isFinite(vat) && vat >= 0 && vat <= 30, "VAT percent sane");

  console.log("[test:full-connect] unit checks OK", {
    sampleTotalMxn: snap0.cartP.totalCents / 100,
    applicationFeeMxn: snap0.applicationFeeCents / 100,
    vatPercent: snap0.cartP.vatPercent,
  });
}

const FETCH_MS = 25_000;

async function discoverDevBase(explicit: string | undefined): Promise<string> {
  if (explicit) return explicit.replace(/\/$/, "");
  const ports = [3000, 3001, 3002, 3003, 3004, 3005];
  for (const port of ports) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(`${base}/api/auth/me`, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      if (res && (res.status === 401 || res.status === 200)) return base;
    } catch {
      /* try next */
    }
  }
  return `http://127.0.0.1:3000`;
}

async function jwtFor(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "tianguis_dev_secret_change_in_production"
  );
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function runLiveSmoke(): Promise<void> {
  loadDotenv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const listingId = String(process.env.BOOKING_E2E_LISTING_ID ?? "").trim();
  const buyerId = String(process.env.BOOKING_E2E_BUYER_ID ?? "").trim();

  if (!url || !key) {
    console.warn("[test:full-connect] --live skipped: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return;
  }
  if (!stripeKey) {
    console.warn("[test:full-connect] --live skipped: missing STRIPE_SECRET_KEY");
    return;
  }
  if (!listingId || !buyerId) {
    console.warn(
      "[test:full-connect] --live skipped: set BOOKING_E2E_LISTING_ID and BOOKING_E2E_BUYER_ID"
    );
    return;
  }

  const supabase: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const { data: listing, error: lErr } = await supabase
    .from("listings")
    .select("id,seller_id,category_id,status,title_es,price_mxn,commission_pct,package_session_count,package_total_price_mxn")
    .eq("id", listingId)
    .maybeSingle();

  if (lErr || !listing) {
    throw new Error(`[live] listing not found: ${listingId} (${lErr?.message ?? "no row"})`);
  }
  if (listing.status !== "active") {
    throw new Error(`[live] listing not active: ${listing.status}`);
  }
  if (!isServicesListing(listing as { category_id?: string | null })) {
    throw new Error("[live] listing category_id must be services for this smoke test");
  }
  const sellerId = String(listing.seller_id ?? "");
  if (!sellerId || sellerId.toLowerCase() === buyerId.toLowerCase()) {
    throw new Error("[live] buyer must differ from seller and seller_id must be set");
  }

  const connectId = await loadSellerConnectId(supabase, sellerId);
  if (!connectId) {
    throw new Error(
      "[live] seller has no Stripe Connect account (users.stripe_connect_account_id). Onboard seller first."
    );
  }

  await supabase.from("listing_service_contact_gate").upsert(
    {
      listing_id: listingId,
      buyer_id: buyerId,
      contacted_in_app: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "listing_id,buyer_id" }
  );

  // Avoid duplicate pending rows piling up from repeated smoke runs
  await supabase
    .from("service_bookings")
    .delete()
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("payment_status", "pending");

  const base = await discoverDevBase(process.env.BOOKING_E2E_BASE_URL);
  const token = await jwtFor(buyerId);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);

  const res = await fetch(`${base}/api/bookings/checkout`, {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      "Content-Type": "application/json",
      Cookie: `tianguis_token=${token}`,
    },
    body: JSON.stringify({
      listingId,
      checkoutMode: "full_connect",
      note: "e2e full_connect smoke",
    }),
  }).finally(() => clearTimeout(timer));

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    console.error("[live] checkout response", res.status, data);
    throw new Error(`[live] POST /api/bookings/checkout failed: ${res.status}`);
  }

  const sessionUrl = typeof data.url === "string" ? data.url : "";
  const bookingId = typeof data.bookingId === "string" ? data.bookingId : "";
  assert.ok(sessionUrl.includes("checkout.stripe.com"), `expected Stripe Checkout URL, got: ${sessionUrl}`);
  assert.ok(bookingId.length > 0, "bookingId returned");

  const { data: row } = await supabase
    .from("service_bookings")
    .select(
      "checkout_mode,payment_status,subtotal_mxn_cents,commission_amount_cents,vat_mxn_cents,total_charged_mxn_cents,stripe_application_fee_mxn_cents,pricing_base_mxn_cents"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!row) throw new Error(`[live] booking row missing: ${bookingId}`);
  assert.equal(row.checkout_mode, "full_connect");
  assert.equal(row.payment_status, "pending");
  assert.ok(Number(row.pricing_base_mxn_cents) > 0);
  assert.ok(Number(row.total_charged_mxn_cents) > 0);
  assert.ok(Number(row.stripe_application_fee_mxn_cents) >= Number(row.commission_amount_cents));

  console.log("[test:full-connect] live smoke OK", {
    baseUrl: base,
    bookingId,
    checkoutPreviewUrl: sessionUrl.slice(0, 64) + "…",
    totalMxn: Number(row.total_charged_mxn_cents) / 100,
    platformFeeMxn: Number(row.stripe_application_fee_mxn_cents) / 100,
  });
}

async function main() {
  const live = process.argv.includes("--live");
  runUnitTests();
  if (live) {
    await runLiveSmoke();
  } else {
    console.log("[test:full-connect] pass `--live` + env to hit a running app and Stripe test Checkout.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
