# NaranjoGo / Tianguis (Next.js)

Marketplace web app (Next.js 14 App Router). This document focuses on **WhatsApp OTP login**, **Supabase**, **Twilio**, and **deployment**—the pieces that were wired end-to-end for production.

## WhatsApp OTP authentication (high level)

1. User enters phone on **`/auth/login`** (country MX or US).
2. Browser calls **`POST /api/auth/send-otp`** → stores a 6-digit code in Supabase **`otp_codes`**, then sends WhatsApp via **Twilio** (if configured).
3. User enters code on **`/auth/verify`**.
4. Browser calls **`POST /api/auth/verify-otp`** → validates code, upserts **`users`**, returns a **JWT** in JSON.
5. Browser sets cookie **`tianguis_token`** and navigates to **`/profile`**.
6. **`/profile`** loads data via **`GET /api/auth/me`** (server verifies JWT and reads `users` / `listings` with the **service role** so RLS does not block the profile).

## Environment variables (Vercel / local)

Copy `.env.example` to `.env.local` for local development.

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (must match where you run SQL migrations). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Service role** key (not `anon`). Used by OTP routes and `/api/auth/me`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For other pages | Public anon key for client-side Supabase where used. |
| `JWT_SECRET` | Strongly recommended in production | Secret for signing/verifying `tianguis_token` JWT. Must stay stable across deploys. |
| `TWILIO_ACCOUNT_SID` | For real WhatsApp sends | Twilio Account SID. |
| `TWILIO_AUTH_TOKEN` | For real WhatsApp sends | Twilio auth token. |
| `TWILIO_WHATSAPP_FROM` | For real WhatsApp sends | WhatsApp-enabled sender, e.g. `whatsapp:+14155238886` or your approved sender. |
| `NEXT_PUBLIC_APP_URL` | Optional | Used by some server fetches (e.g. search). |
| `FASTAPI_INTERNAL_URL` / `INTERNAL_API_SECRET` | Optional | Rewrites to FastAPI when configured. |

**Common production mistake:** `SUPABASE_SERVICE_ROLE_KEY` left as placeholder text. OTP and profile APIs will fail until it is the real **service_role** key from Supabase **Project Settings → API**.

## Phone number format (app contract)

Numbers are normalized to **E.164 digits without `+`**:

- **Mexico:** `52` + 10 digits → `52XXXXXXXXXX`
- **US/Canada:** `1` + 10 digits → `1XXXXXXXXXX`

Validation lives in `lib/phone.ts` (`isValidAuthPhone`, `normalizeAuthPhone`).

## Supabase database

### `otp_codes` table

OTP storage for `send-otp` / `verify-otp`. Apply on the **same** Supabase project as `NEXT_PUBLIC_SUPABASE_URL`:

- `supabase/migrations/20260415140000_otp_codes.sql` — creates `public.otp_codes`
- `supabase/migrations/20260415141000_otp_codes_ensure_columns.sql` — adds missing columns if an older partial table existed

Run these in **Supabase → SQL Editor** (or your migration pipeline). Pushing to GitHub **does not** apply SQL to Supabase automatically.

### `users` table

`verify-otp` upserts `users` on conflict **`phone`** with `phone_verified: true` and `trust_badge: "bronze"`. Your project must have a compatible `users` schema and unique constraint on `phone` for upsert to work.

## Twilio WhatsApp

- If `TWILIO_*` env vars are **all** set, `send-otp` sends via Twilio REST.
- If they are **missing**, the route logs the OTP server-side (useful for dev only).
- **Sandbox:** recipient numbers must opt in to your Twilio WhatsApp sandbox before messages arrive.
- **`TWILIO_WHATSAPP_FROM`** should be a WhatsApp sender (`whatsapp:+...`). The API normalizes values that omit the `whatsapp:` prefix.

## API routes (auth)

| Route | Method | Role |
|-------|--------|------|
| `/api/auth/send-otp` | POST | Rate-limit check, insert OTP, optional Twilio send. |
| `/api/auth/verify-otp` | POST | Validate OTP, mark used, upsert user, return JWT. |
| `/api/auth/me` | GET | Return current user + listings from cookie JWT (service role). |
| `/api/auth/me` | PATCH | Update `display_name` for current user (service role). |

On `send-otp` errors, JSON may include **`requestId`** (matches Vercel `x-vercel-id`) and **`step`**: `rate_limit` | `insert` | `twilio` — useful when correlating with Vercel logs.

## In-app messaging (Phase 2)

Buyer–seller chat is **per listing**: one thread per pair **`(listing_id, buyer_id)`**; `seller_id` is stored on the row for fast inbox queries.

### Database

Apply on the same Supabase project:

- `supabase/migrations/20260420120000_listing_messaging.sql` — creates `listing_conversations` and `listing_messages`.
- **`listing_id` is `UUID`** to match Supabase projects where `public.listings.id` is UUID. If your `listings.id` is `TEXT`, change that column in the migration to `TEXT` (and align the `REFERENCES` clause).
- If an earlier run failed mid-migration, run `20260420120100_listing_messaging_repair.sql` (drops the two tables), then run `20260420120000` again.

### UI

- **`/listing/[id]`** — `ListingChat` block (above WhatsApp). Buyers start a thread by sending the first message; sellers see a list of buyers for that listing and select a thread to reply.
- **`/messages`** — inbox (all threads where the user is buyer or seller).
- **`/messages/[conversationId]`** — full-screen thread.

### API (cookie session + service role)

| Route | Method | Role |
|-------|--------|------|
| `/api/conversations?listingId=` | GET | Buyer: their thread + messages; seller: threads for this listing. |
| `/api/conversations` | POST `{ listingId }` | Buyer: create thread (idempotent). |
| `/api/conversations/[id]` | GET | Participant: thread + messages + listing title. |
| `/api/conversations/[id]/messages` | POST `{ body }` | Participant: append message (max 4000 chars). |
| `/api/conversations/inbox` | GET | All threads for current user. |

Shared JWT + Supabase admin client helpers live in `lib/auth-server.ts` (also used by `/api/auth/me`).

### Optional deep link

Open a specific thread on the listing page: `/listing/{id}?chat={conversationId}`.

## Deploy (GitHub → Vercel)

1. Commit and push to **`main`** (or the branch connected to Vercel production).
2. Vercel builds automatically; wait until deployment status is **Ready**.
3. Ensure **all** env vars above are set for **Production** in Vercel.
4. After DB changes, run SQL in Supabase; redeploy is not strictly required for SQL-only changes, but code changes need a new deployment.

## Troubleshooting (quick)

| Symptom | Likely cause |
|---------|----------------|
| `No se pudo enviar el código OTP` + `step: "rate_limit"` | Supabase query on `otp_codes` failed — wrong project/key, or table/columns missing. |
| `step: "insert"` | Row insert failed — schema mismatch, permissions. |
| `step: "twilio"` | Twilio rejected send — sender, sandbox opt-in, or credentials. |
| OTP works but profile/login loop | Was often **RLS** blocking anon reads on `users`; use **`/api/auth/me`** (current code). |
| Client “Application error” after deploy | Hard refresh; confirm latest commit is deployed; check browser console for the first stack line. |

## Repo layout (partial)

- `app/` — Next.js App Router pages and API routes
- `app/api/auth/` — OTP + session + profile loader
- `app/api/conversations/` — in-app messaging APIs
- `app/messages/` — inbox + thread pages
- `components/` — `LoginForm`, `VerifyForm`, `Header`, etc.
- `lib/phone.ts` — phone validation/formatting
- `supabase/migrations/` — SQL migrations (run in Supabase for production DB)

## Related docs

- `docs/MARKETPLACE_ROLLOUT.md` — **production defaults**: CP 37700, Services-only category tabs, hero chip/colonia layout
- `docs/SECURITY.md` — **security posture**: layered controls, informal score, gaps, key file references
- `docs/SERVICE_ROLE.md` — **rules for `SUPABASE_SERVICE_ROLE_KEY`** (service role / `createAdminSupabase`)
- `docs/ARCHITECTURE_DATABASE.md` — broader database / listings architecture
- `listings-api/README.md`, `ml-service/README.md` — other services in this monorepo-style layout
