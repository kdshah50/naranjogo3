# Rides Project — Progress Log

A running diary of every step we've taken to build the rides + AI agents vertical, so you can pick up where we left off at any time.

**Goal of this project:** Add a taxi/ride-hailing vertical with AI agents (WhatsApp-native booking, OXXO wallet funding, Stripe Connect payouts) without disturbing the existing marketplace cart, services, or sell/buy flows.

**Source of truth for the design:** [`docs/RIDES_AI_PLAN.md`](./RIDES_AI_PLAN.md)

---

## Where we are right now

| Item | Status |
|---|---|
| Current branch | `rides-setup` |
| Production (`naranjogo.com.mx`) | **Unchanged** — nothing rides-related deployed to `main` yet |
| Preview URL (testing ground) | Vercel deployment for branch `rides-setup` |
| Supabase project | Production (single project; new tables added are isolated/empty until used) |
| Feature flag (`RIDES_ENABLED`) | `false` in Production, `true` in Preview + Development |
| Current phase | **Phase 1 — Driver onboarding** |
| Phase 0 (wallet) | **Complete** — card top-up, verify-session fallback, `/saldo` UI |
| Latest step completed | **Phase 1 code** — `driver_profiles`, `/api/driver-signup`, `/conductor` UI |
| Next step | Run migration in Supabase + create `driver-docs` storage bucket → test signup on preview |

---

## How to resume after a break

1. Open this file (`docs/RIDES_PROGRESS.md`)
2. Check "Where we are right now" above
3. Make sure you're on the right branch:
   ```bash
   git branch --show-current        # should print: rides-setup
   git checkout rides-setup && git pull
   ```
4. Tell the AI: "Continue rides Phase 1 testing" or "Continue rides from Step N"

**Do not merge to `main` until preview testing passes** — wallet + driver signup should both work on the preview URL first.

---

## Useful commands cheat sheet

| Task | Command |
|---|---|
| Check current branch | `git branch --show-current` |
| Switch to rides branch | `git checkout rides-setup` |
| Validator unit tests | `npm run test:driver-onboarding` |
| Push (triggers Vercel preview rebuild) | `git push` |

---

## Phase 0 — Wallet (COMPLETE)

| Step | What | Status |
|---|---|---|
| 1–5 | Branch, flags, DB tables, wallet library, GET `/api/rides/wallet` | ✓ |
| 6 | Card top-up via Stripe Checkout (`/saldo`, `/api/rides/wallet/topup`) | ✓ |
| 7–8 | Webhook + verify-session fallback; $500 test top-up on preview | ✓ |

Key files: `lib/rides/wallet-*.ts`, `app/saldo/page.tsx`, `app/api/rides/wallet/*`

OXXO deferred until Mexican Stripe account (`WALLET_TOPUP_OXXO_ENABLED=true`).

---

## Phase 1 — Driver onboarding (IN PROGRESS)

### What was built

| Piece | File(s) |
|---|---|
| DB migration | `supabase/migrations/20260520120000_rides_driver_profiles.sql` — `driver_profiles` + `listings.subcategory_kind` |
| Validators + signup helpers | `lib/rides/driver-onboarding.ts` |
| Document upload (private bucket) | `lib/rides/driver-storage.ts` |
| Signup API | `POST /api/driver-signup` — JSON or multipart; gated by `RIDES_ENABLED` |
| Driver status API | `GET /api/rides/drivers/me` — logged-in user profile + approval state |
| Signup UI | `/conductor` — 4-step form with photo uploads |
| Ride listing helper | `isRideListing()` in `lib/listing-category.ts` |
| Unit tests | `npm run test:driver-onboarding` |

**`/api/provider-signup` was not modified.**

### Before testing on preview

1. **Run migration** in Supabase SQL Editor:
   - Copy from `supabase/migrations/20260520120000_rides_driver_profiles.sql`
2. **Create storage bucket** `driver-docs` (private) in Supabase → Storage
3. Push branch → open preview URL → visit **`/conductor`**
4. Submit test driver → verify rows in `driver_profiles` + `listings` (`subcategory_kind = 'ride'`, `is_verified = false`)
5. **Admin approve** (manual, for now):
   ```sql
   UPDATE listings SET is_verified = true WHERE subcategory_kind = 'ride' AND seller_id = '<user_id>';
   UPDATE driver_profiles SET is_active_driver = true WHERE user_id = '<user_id>';
   ```
6. Logged-in driver: `GET /api/rides/drivers/me` → `can_receive_rides: true`

### After Phase 1

- Phase 2 — WhatsApp Cloud API
- Phase 3 — Booking Agent (LangGraph)
- See `docs/RIDES_AI_PLAN.md` §12

---

## Rollback plan

Production stays safe: `RIDES_ENABLED=false` on main even after merge. To drop Phase 1 tables only:

```sql
DROP TABLE IF EXISTS public.driver_profiles;
ALTER TABLE public.listings DROP COLUMN IF EXISTS subcategory_kind;
```

---

*Last updated: Phase 1 driver onboarding code added; testing on preview before merge to main.*
