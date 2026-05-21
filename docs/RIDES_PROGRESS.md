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
| Current phase | **Phase 2 + 3 foundation** — ready for combined preview test |
| Phase 0 (wallet) | **Complete** — card top-up, verify-session fallback, `/saldo` UI |
| Phase 1 (driver onboarding) | **Complete** — tested on preview; admin approval via SQL |
| Latest step completed | **Phase 2 + 3 code** — bookings, dispatch, `/viaje`, Twilio inbound |
| Next step | Run `20260522120000_rides_bookings_foundation.sql` → test per [`RIDES_PHASE23_TEST.md`](./RIDES_PHASE23_TEST.md) |

---

## How to resume after a break

1. Open this file (`docs/RIDES_PROGRESS.md`)
2. Check "Where we are right now" above
3. Make sure you're on the right branch:
   ```bash
   git branch --show-current        # should print: rides-setup
   git checkout rides-setup && git pull
   ```
4. Tell the AI: "Continue rides Phase 2+3 testing" or follow [`RIDES_PHASE23_TEST.md`](./RIDES_PHASE23_TEST.md)

**Do not merge to `main` until preview testing passes.**

---

## Useful commands cheat sheet

| Task | Command |
|---|---|
| Check current branch | `git branch --show-current` |
| Switch to rides branch | `git checkout rides-setup` |
| Driver validator tests | `npm run test:driver-onboarding` |
| Ride pricing / parser tests | `npm run test:ride-pricing` |
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

**Note:** Wallet *hold/capture* is balance-check only until Phase 4.

---

## After Phase 2 + 3

- Phase 4 — Trip lifecycle (accept/arrive/start/complete) + real wallet hold/capture
- Phase 5 — Support agent + disputes
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
