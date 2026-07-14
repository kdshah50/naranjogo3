import "server-only";

/** Obvious placeholders — fail fast in production deploys. */
const SERVICE_ROLE_PLACEHOLDER = /^(your_service|changeme|placeholder|xxx|sk-your|test_only)/i;

/**
 * Fail fast when production is misconfigured (missing secrets or public service role).
 * Called from `instrumentation.ts` on Node runtime only.
 *
 * Vercel Preview also uses NODE_ENV=production. Hard-fail only for
 * `VERCEL_ENV=production` so a missing Preview-only secret (e.g. PII key)
 * cannot take down OTP and every API with a static /500 page.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  /** Local `next build` without prod secrets only — never set on a real production host. */
  if (process.env.SKIP_PRODUCTION_ENV_GUARD === "1") return;

  /** `next build` loads the Node bundle — env may be incomplete; runtime enforces secrets. */
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  const hardFail = vercelEnv === "production" || vercelEnv === "";

  const fail = (message: string) => {
    if (hardFail) throw new Error(message);
    console.error(`[env-production-guard] preview warning: ${message}`);
  };

  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    fail(
      "Remove NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: the service role must never use a NEXT_PUBLIC_ prefix.",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url) {
    fail("NEXT_PUBLIC_SUPABASE_URL is required in production");
  }

  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!srk) {
    fail("SUPABASE_SERVICE_ROLE_KEY is required in production (server only)");
  } else if (srk.length < 80) {
    fail("SUPABASE_SERVICE_ROLE_KEY looks invalid — use the full service_role JWT from Supabase API settings");
  } else if (SERVICE_ROLE_PLACEHOLDER.test(srk) || srk.includes("your_service_role")) {
    fail("SUPABASE_SERVICE_ROLE_KEY must not be a placeholder in production");
  }

  const jwt = process.env.JWT_SECRET?.trim() ?? "";
  if (jwt.length < 32) {
    fail("JWT_SECRET must be at least 32 characters in production");
  }

  const piiKey = process.env.PII_ENCRYPTION_KEY?.trim() ?? "";
  if (!piiKey) {
    fail("PII_ENCRYPTION_KEY is required in production (generate: openssl rand -base64 32)");
  } else {
    try {
      if (Buffer.from(piiKey, "base64").length !== 32) {
        throw new Error("invalid length");
      }
    } catch {
      fail("PII_ENCRYPTION_KEY must be 32 bytes base64-encoded (openssl rand -base64 32)");
    }
  }
}
