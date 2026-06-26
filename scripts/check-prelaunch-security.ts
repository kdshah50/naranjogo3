/**
 * Pre-launch security readiness — read-only env checks. Does not call APIs or mutate data.
 *
 *   npm run check:prelaunch-security
 *   npm run check:prelaunch-security -- --production   # stricter (Vercel Production mirror)
 *
 * Loads .env.local / .env when present. Never prints secret values.
 */
import { loadDotenv } from "./lib/rides-test-helpers";

loadDotenv();

const productionMode = process.argv.includes("--production");

const PLACEHOLDER = /^(your_|changeme|placeholder|xxx|sk-your|test_only|whsec_xxx|sk_test_xxx)/i;

type Result = { level: "ok" | "warn" | "fail"; label: string; detail?: string };

const results: Result[] = [];

function ok(label: string, detail?: string) {
  results.push({ level: "ok", label, detail });
}

function warn(label: string, detail?: string) {
  results.push({ level: "warn", label, detail });
}

function fail(label: string, detail?: string) {
  results.push({ level: "fail", label, detail });
}

function envSet(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function envLen(key: string): number {
  return (process.env[key] ?? "").trim().length;
}

function checkRequired(key: string, label: string, minLen = 1) {
  const v = (process.env[key] ?? "").trim();
  if (!v) {
    fail(label, `${key} is missing`);
    return;
  }
  if (v.length < minLen) {
    fail(label, `${key} looks too short (${v.length} chars, need ≥${minLen})`);
    return;
  }
  if (PLACEHOLDER.test(v) || v.includes("your_service_role") || v.includes("your_anon")) {
    fail(label, `${key} still looks like a placeholder`);
    return;
  }
  ok(label);
}

function checkRecommended(key: string, label: string) {
  if (envSet(key)) ok(label);
  else warn(label, `${key} not set — optional but recommended before launch`);
}

// ── Dangerous misconfigurations ─────────────────────────────────────────────

if (envSet("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY")) {
  fail("No public service role", "Remove NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY immediately");
} else {
  ok("No public service role");
}

if (process.env.SKIP_PRODUCTION_ENV_GUARD === "1") {
  if (productionMode) {
    fail("Production env guard", "SKIP_PRODUCTION_ENV_GUARD=1 must never be set on Production");
  } else {
    warn("Production env guard", "SKIP_PRODUCTION_ENV_GUARD=1 is set (dev/build only — remove on Vercel Production)");
  }
} else {
  ok("Production env guard skip flag off");
}

// ── Core secrets ────────────────────────────────────────────────────────────

checkRequired("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL");
checkRequired("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key", 20);
checkRequired("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role", 80);
checkRequired("JWT_SECRET", "JWT session secret", productionMode ? 32 : 16);

const adminPinLen = envLen("ADMIN_PIN");
if (adminPinLen === 0) {
  if (productionMode) fail("Admin PIN", "ADMIN_PIN is required for admin routes in production");
  else warn("Admin PIN", "ADMIN_PIN not set — admin UI returns 503 until configured");
} else if (adminPinLen < 12) {
  warn("Admin PIN strength", `ADMIN_PIN is only ${adminPinLen} chars — use ≥12 random characters in production`);
} else {
  ok("Admin PIN configured");
}

// ── Auth / messaging ────────────────────────────────────────────────────────

const twilioOk =
  envSet("TWILIO_ACCOUNT_SID") && envSet("TWILIO_AUTH_TOKEN") && envSet("TWILIO_WHATSAPP_FROM");
if (twilioOk) ok("Twilio WhatsApp OTP");
else if (productionMode) fail("Twilio WhatsApp OTP", "All TWILIO_* vars required in production");
else warn("Twilio WhatsApp OTP", "TWILIO_* incomplete — OTP will log server-side in dev only");

// ── Payments ─────────────────────────────────────────────────────────────────

if (productionMode) {
  checkRequired("STRIPE_SECRET_KEY", "Stripe secret key", 20);
  checkRequired("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret", 10);
  checkRequired("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Stripe publishable key", 10);
  const sk = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (sk.startsWith("sk_test_")) {
    warn("Stripe live mode", "STRIPE_SECRET_KEY is sk_test_ — use live keys on Production when accepting real payments");
  } else if (sk.startsWith("sk_live_")) {
    ok("Stripe live mode");
  }
} else {
  const stripeOk =
    envSet("STRIPE_SECRET_KEY") &&
    envSet("STRIPE_WEBHOOK_SECRET") &&
    envSet("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (stripeOk) ok("Stripe keys");
  else warn("Stripe keys", "STRIPE_* not fully set locally — required on Vercel Production");
}

// ── Cron / automation ───────────────────────────────────────────────────────

if (productionMode) checkRequired("CRON_SECRET", "Cron bearer secret", 16);
else checkRecommended("CRON_SECRET", "Cron bearer secret");

// ── Abuse / observability (recommended, no flow change when added) ──────────

checkRecommended("UPSTASH_REDIS_REST_URL", "Upstash Redis URL (distributed rate limits)");
checkRecommended("UPSTASH_REDIS_REST_TOKEN", "Upstash Redis token");
if (envSet("UPSTASH_REDIS_REST_URL") !== envSet("UPSTASH_REDIS_REST_TOKEN")) {
  fail("Upstash pair", "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither");
}

function isValidSentryDsn(dsn: string): boolean {
  try {
    const u = new URL(dsn);
    return u.protocol === "https:" && u.hostname.includes("sentry.io") && u.pathname.length > 1;
  } catch {
    return false;
  }
}

const sentryDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
if (!sentryDsn) {
  if (productionMode) fail("Sentry DSN", "NEXT_PUBLIC_SENTRY_DSN required on Production");
  else warn("Sentry error monitoring", "NEXT_PUBLIC_SENTRY_DSN not set — errors won't reach Sentry");
} else if (!isValidSentryDsn(sentryDsn)) {
  fail("Sentry DSN format", "NEXT_PUBLIC_SENTRY_DSN must be a https://…ingest…sentry.io/… URL from your Sentry project");
} else {
  ok("Sentry error monitoring");
}

// ── App URL ─────────────────────────────────────────────────────────────────

if (productionMode) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!appUrl) fail("App URL", "NEXT_PUBLIC_APP_URL required on Production");
  else if (!/^https:\/\/.+/i.test(appUrl)) warn("App URL", "NEXT_PUBLIC_APP_URL should use https://");
  else ok("App URL");
} else {
  checkRecommended("NEXT_PUBLIC_APP_URL", "Canonical app URL");
}

// ── Feature flags (informational) ─────────────────────────────────────────────

const rides = (process.env.RIDES_ENABLED ?? "").trim().toLowerCase() === "true";
const wallet = (process.env.WALLET_ENABLED ?? "").trim().toLowerCase() === "true";
if (rides) warn("Rides enabled", "RIDES_ENABLED=true — review rides security before launch");
else ok("Rides disabled (default safe for Services MVP)");

if (wallet) warn("Wallet enabled", "WALLET_ENABLED=true — extra payment QA recommended");
else ok("Wallet disabled (default safe for Services MVP)");

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\nPre-launch security check${productionMode ? " (production mode)" : ""}\n`);

for (const r of results) {
  const icon = r.level === "ok" ? "✓" : r.level === "warn" ? "!" : "✗";
  const line = r.detail ? `${r.label}: ${r.detail}` : r.label;
  console.log(`  ${icon}  ${line}`);
}

const fails = results.filter((r) => r.level === "fail").length;
const warns = results.filter((r) => r.level === "warn").length;
const oks = results.filter((r) => r.level === "ok").length;

console.log(`\n${oks} ok, ${warns} warn, ${fails} fail\n`);

if (fails > 0) {
  console.log("Fix failures before production launch. Warnings are safe to defer but improve resilience.\n");
  process.exit(1);
}

if (warns > 0 && productionMode) {
  console.log("No blockers. Review warnings — especially Upstash and Sentry — before high-traffic launch.\n");
  process.exit(0);
}

console.log("All required checks passed.\n");
process.exit(0);
