# Security posture — Naranjogo (naranjogo.com.mx)

This document describes **security controls implemented in this repository** and a **qualitative score**. It is based on code and migrations as of the document date; it does **not** replace a third-party penetration test, SOC 2 audit, or Vercel/account-level configuration review.

---

## Overall score

| Metric | Value |
|--------|--------|
| **Composite (1–10)** | **7.8 / 10** |
| **Grade (informal)** | **Low A-** — CSP enforced in prod; **Upstash-backed OTP IP limits** when `UPSTASH_*` is set in Vercel; service-role modules gated with `server-only` |

### How to read the score

- **7.8** reflects layered controls including **enforcing CSP in production** (with env rollback), **distributed OTP IP limits via Upstash Redis** when env vars are set (production), **`server-only` gates** on service-role modules, plus remaining reliance on per-route authorization correctness.
- It is **not** a certification and **not** derived from runtime scanning of production-only settings (WAF, Vercel firewall, org IAM).

### Score by area

| Area | Score (/10) | Summary |
|------|-------------|---------|
| Transport & browser hardening | 8.0 | HSTS (prod), nosniff, frame deny, referrer policy, Permissions-Policy; **CSP enforcing** in production (`Content-Security-Policy`). Set `CSP_MODE=report` temporarily if diagnosing breakage. |
| Session & authentication | 8.0 | JWT (`jose`) validated server-side from cookie; UUID comparison hardened; OTP verify/use-once pattern. |
| API authorization | 7.0 | Per-route checks (`getUserIdFromRequest`), listing owner + optional admin PIN; **no single global middleware** — consistency depends on each handler. |
| Database | 7.8 | RLS enabled; intentional narrow `anon` reads for active listings / seller subset; sensitive paths via **service role** on server only — **`server-only`** on `lib/auth-server.ts` and `lib/service-rest.ts`; see `docs/SERVICE_ROLE.md`. |
| Payments | 8.5 | Stripe webhook **`constructEvent`** + signing secret required. |
| Abuse / rate limiting | 8.0 | OTP: DB-backed phone windows; IP limit uses **Upstash Redis** when `UPSTASH_*` is configured (**shared across serverless instances**); falls back to **in-memory per instance** if unset. |
| File uploads | 7.5 | Auth required, MIME allowlist, size cap, path scoped by user id. |
| Internal / auxiliary APIs | 8.0 | FastAPI internal routes use shared secret header; CORS allowlisted to app URL. |
| Cron / automation | 8.0 | `Authorization: Bearer CRON_SECRET` on cron routes. |
| Observability | 7.0 | Sentry wrapping; depends on env configuration. |

**Composite** is a weighted judgment across these rows (not a formal formula). Adjust if your threat model prioritizes compliance, fraud, or availability differently.

---

## Architecture layers (what is implemented)

### 1. Edge / HTTPS / response headers

- **Hosting**: Next.js on Vercel — TLS is handled by the platform.
- **Headers** (`next.config.mjs`): `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **CSP**: Production sends **`Content-Security-Policy`** (`lib/csp.mjs`). Override with **`CSP_MODE`**: `enforce` (default), `report` (report-only), or `off`.
- **Auth routes**: `Cache-Control: no-store` on `/auth/*`.

### 2. Application session

- Cookie **`tianguis_token`** verified with **`jwtVerify`** (`lib/auth-server.ts`).
- **`JWT_SECRET`** must be configured server-side (`lib/jwt-secret` usage).

### 3. API routes (Next.js Route Handlers)

- Protected actions resolve identity via **`getUserIdFromRequest`**.
- Listing writes: **owner** match on `seller_id`, or **admin** via **`ADMIN_PIN`** from server env (see `app/api/listings/[id]/route.ts`).
- Admin PIN entry validated server-side: `app/api/admin/verify-pin/route.ts` with **IP rate limiting** (`rateLimitAdminPinByIp` in `lib/rate-limit.ts`; Upstash when configured, else in-memory per instance).

### 4. Database (Supabase Postgres)

- **RLS enabled** on core tables (`supabase/migrations/20260422120000_row_level_security.sql`).
- **Public read policies** for catalog: active `listings` and restricted `users` rows tied to active sellers (`20260423120000_rls_public_read_listings_users.sql`).
- **Column-level `GRANT SELECT` on `users` for `anon`/`authenticated`**: only a safe subset of columns (no phone, CURP, RFC, INE URLs, `referred_by`) — `20260425110000_users_anon_no_phone.sql`; `service_role` retains full access for server routes.
- **PostgREST service role** (`lib/service-rest.ts`): used only on the server; bypasses RLS — **authorization must be enforced in application code**.
- **Production boot check**: `instrumentation.ts` calls `assertProductionSecrets()` (`lib/env-production-guard.ts`) — rejects missing `SUPABASE_SERVICE_ROLE_KEY` / short JWT, weak `JWT_SECRET`, or any `NEXT_PUBLIC_*` service-role leak. Skips during `next build` (`NEXT_PHASE=phase-production-build`) or when `SKIP_PRODUCTION_ENV_GUARD=1` (never on real production).

### 5. Payments

- **`app/api/webhooks/stripe/route.ts`**: requires `stripe-signature` and **`STRIPE_WEBHOOK_SECRET`**; rejects invalid signatures.

### 6. OTP & SMS

- **`app/api/auth/send-otp/route.ts`**: phone validation; IP rate limiting via **`lib/rate-limit.ts`** (Upstash when configured, else memory); DB-backed frequency limits.
- **`app/api/auth/verify-otp/route.ts`**: verifies code, expiry, single use.

### 7. Uploads

- **`app/api/upload-listing-photo/route.ts`**: authentication required; type allowlist (JPEG/PNG/WebP); max size; upload via service role to configured bucket.

### 8. Internal ML API (FastAPI)

- **`fastapi/app/main.py`**: CORS restricted toward app URL; internal routers gated by **`INTERNAL_API_SECRET`** header.

### 9. Scheduled jobs

- **`app/api/cron/*`**: **`CRON_SECRET`** bearer check.

---

## Known gaps & recommended next steps

Prioritize based on risk (fraud volume, regulatory requirements, publicity).

1. ~~**Enforce CSP**~~ — **Done** (production default); use `CSP_MODE=report` if diagnosing violations.
2. ~~**Distributed rate limiting**~~ — **Optional**: configure **`UPSTASH_REDIS_REST_URL`** + **`UPSTASH_REDIS_REST_TOKEN`** (Redis-free tier via Upstash) so OTP IP limits are shared across instances.
3. **Centralized auth middleware** or shared helper coverage audit — ensure every mutating route validates identity consistently.
4. **Service role blast radius**: periodic review of all routes using `SUPABASE_SERVICE_ROLE_KEY`; automated tests for IDOR on listing/booking/message endpoints. Guidelines: `docs/SERVICE_ROLE.md`.
5. **Dependency & secret scanning** in CI (npm audit, Dependabot, trufflehog or similar).
6. **External assessment**: annual pentest or bug bounty before large trust claims.

---

## Key file references

| Topic | Location |
|-------|----------|
| JWT / session | `lib/auth-server.ts`, `lib/jwt-secret.ts` |
| Service role / prod env guard | `lib/auth-server.ts`, `lib/service-rest.ts`, `lib/env-production-guard.ts`, `instrumentation.ts`, `docs/SERVICE_ROLE.md` |
| Security headers & CSP | `next.config.mjs`, `lib/csp.mjs` (`CSP_MODE`) |
| Stripe webhook | `app/api/webhooks/stripe/route.ts` |
| OTP send / verify | `app/api/auth/send-otp/route.ts`, `app/api/auth/verify-otp/route.ts` |
| OTP IP rate limit | `lib/rate-limit.ts`, `lib/rate-limit-memory.ts` |
| Listing auth | `app/api/listings/[id]/route.ts` |
| Uploads | `app/api/upload-listing-photo/route.ts` |
| RLS migrations | `supabase/migrations/20260422120000_row_level_security.sql`, `20260423120000_rls_public_read_listings_users.sql` |
| Cron auth | `app/api/cron/reconcile-payments/route.ts`, `app/api/cron/send-booking-reminders/route.ts` |
| FastAPI internal auth | `fastapi/app/main.py` |

---

## Document maintenance

Update this file when:

- Security headers or CSP mode changes.
- Authentication or session mechanism changes.
- Major new tables/policies or RLS behavior changes.
- New payment or webhook integrations.

---

*Last updated: generated as part of engineering documentation; amend with date and author when changing materially.*
