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
| Current phase | **Phase 4** — trip lifecycle + wallet hold/capture (ready for preview test) |
| Phase 2 + 3 | **Complete** — bookings, dispatch, `/viaje`, Twilio inbound |
| Latest step completed | **Phase 4 code** — hold/capture, lifecycle APIs, `/conductor/viajes` |
| Next step | **[`RIDES_FULL_MANUAL_TEST.docx`](./RIDES_FULL_MANUAL_TEST.docx)** — all phases 0–4 step-by-step (Word) |

---

## How to resume after a break

1. Open this file (`docs/RIDES_PROGRESS.md`)
2. Check "Where we are right now" above
3. Make sure you're on the right branch:
   ```bash
   git branch --show-current        # should print: rides-setup
   git checkout rides-setup && git pull
   ```
4. Follow **[`RIDES_FULL_MANUAL_TEST.docx`](./RIDES_FULL_MANUAL_TEST.docx)** or [`RIDES_FULL_MANUAL_TEST.md`](./RIDES_FULL_MANUAL_TEST.md)

**Do not merge to `main` until preview testing passes.**

---

## Useful commands cheat sheet

| Task | Command |
|---|---|
| Check current branch | `git branch --show-current` |
| Switch to rides branch | `git checkout rides-setup` |
| Driver validator tests | `npm run test:driver-onboarding` |
| Ride lifecycle tests | `npm run test:ride-lifecycle` |
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

## Phase 1 — Driver onboarding (COMPLETE)

| Piece | File(s) |
|---|---|
| DB migration | `supabase/migrations/20260520120000_rides_driver_profiles.sql` |
| Storage bucket | `supabase/migrations/20260521120000_driver_docs_storage_bucket.sql` |
| Signup API + UI | `/api/driver-signup`, `/conductor` |
| Driver status | `GET /api/rides/drivers/me` |
| Unit tests | `npm run test:driver-onboarding` |

Admin approval (manual for now):

```sql
UPDATE listings SET is_verified = true WHERE subcategory_kind = 'ride' AND seller_id = '<user_id>';
UPDATE driver_profiles SET is_active_driver = true WHERE user_id = '<user_id>';
```

---

## Phase 2 — WhatsApp inbound (FOUNDATION — test tomorrow)

| Piece | File(s) |
|---|---|
| Twilio inbound webhook | `POST /api/rides/whatsapp/inbound` |
| Message parser | `lib/rides/whatsapp-inbound.ts` |
| Flag | `RIDES_WHATSAPP_INBOUND_ENABLED=true` on preview |
| Notifications | `lib/rides/ride-notify.ts` (buyer + driver Twilio) |

Meta Cloud API templates deferred — Twilio sandbox is enough for first combined test.

**Twilio setup:** point sandbox "When a message comes in" to  
`https://YOUR-PREVIEW.vercel.app/api/rides/whatsapp/inbound`

Example message: `taxi de centro a guadalupe`

---

## Phase 3 — Booking + dispatch (FOUNDATION — test tomorrow)

| Piece | File(s) |
|---|---|
| DB migration | `supabase/migrations/20260522120000_rides_bookings_foundation.sql` |
| Pricing | `lib/rides/ride-pricing.ts` |
| Dispatch | `lib/rides/dispatch.ts` (colonia-centroid; Mapbox later) |
| Bookings server | `lib/rides/ride-bookings-server.ts` |
| APIs | `/api/rides/request`, `/api/rides/[id]`, `/api/rides/pricing/estimate`, `/api/rides/drivers/nearby`, `/api/rides/[id]/match` |
| Test UI | `/viaje` |
| ride-ai skeleton | `ride-ai/` (optional for tomorrow — Next.js path is enough) |
| Unit tests | `npm run test:ride-pricing` |
| Test checklist | [`docs/RIDES_PHASE23_TEST.md`](./RIDES_PHASE23_TEST.md) |

**Note:** Wallet hold is placed at **match**; capture at **complete**. See Phase 4 below.

---

## Phase 4 — Trip lifecycle + wallet (FOUNDATION — test with 2+3)

| Piece | File(s) |
|---|---|
| Driver online migration | `supabase/migrations/20260523120000_rides_phase4_driver_online.sql` |
| Wallet hold/release/capture | `lib/rides/wallet-hold.ts` |
| Lifecycle state machine | `lib/rides/ride-lifecycle.ts`, `lib/rides/ride-trip-server.ts` |
| Lifecycle APIs | `/api/rides/[id]/accept|arrive|start|complete|cancel|tip|dispute` |
| Driver panel | `/conductor/viajes` — online toggle + trip actions |
| Active rides | `GET /api/rides/active`, `GET /api/rides/drivers/me/trips` |
| Online + GPS | `POST /api/rides/drivers/me/online` |
| Unit tests | `npm run test:ride-lifecycle` |
| Test checklist | [`docs/RIDES_PHASE4_TEST.md`](./RIDES_PHASE4_TEST.md) |

---

## After Phase 4

- Phase 5 — Support agent + dispute queue
- See `docs/RIDES_AI_PLAN.md` §12

---

## Rollback plan

Production stays safe: `RIDES_ENABLED=false` on main even after merge.

Phase 3 only:

```sql
DROP TABLE IF EXISTS public.ride_events;
DROP TABLE IF EXISTS public.ride_bookings;
```

---

*Last updated: Phase 2 + 3 foundation on `rides-setup`; combined preview test ready.*
