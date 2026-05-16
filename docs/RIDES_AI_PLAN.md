 # Rides Module + AI Agents — Design & Delivery Plan

Owner: TBD · Status: **Draft for approval** · Last updated: 2026-05-16

---

## 1. Executive summary

Add a **taxi/ride-hailing vertical** to Naranjogo as a bolt-on module with an AI agent layer (LangGraph on Python/FastAPI) for WhatsApp-native booking. The vertical funds itself via a **prepaid wallet** topped up through **Stripe OXXO**, preventing cash bypass and capturing platform commission on every fare.

**Hard constraint:** zero behaviour change for existing flows (marketplace cart, fixed-price service bookings, listings, sell/buy, provider signup). Achieved through a strict additive-only pattern (new tables, new routes, new namespace) plus a master `RIDES_ENABLED` feature flag.

**Approval gate:** every existing flow must pass its regression suite before any new code is merged behind the flag, and the flag must remain `false` in production until phase-level acceptance tests pass.

---

## 2. Goals and non-goals

### Goals (v1)
- Buyer can request a ride via WhatsApp (or in-app) and be matched with a verified driver.
- All money flows through the platform — no driver/buyer cash exchange.
- Drivers onboard with vehicle/license/insurance verification, reusing existing provider trust primitives.
- AI handles natural-language booking intake and first-line support; money math and state transitions remain deterministic.
- Existing services, cart, and provider flows behave identically to today (byte-for-byte test parity).

### Non-goals (v1)
- Live traffic-aware ETA optimization (Mapbox baseline is fine for v1).
- Predictive demand / surge ML (rule-based surge only).
- Voice booking (text-only on WhatsApp; voice notes deferred).
- Multi-stop rides.
- Mercado Pago payouts (Stripe only).
- Negotiated taxi pricing (metered only; existing contact-gate negotiation is untouched).

---

## 3. Existing-flow protection guarantees

These are the **non-negotiable contracts** the new module must satisfy. Each is enforced by tests gated on PR merge.

### G1. Files that must not change semantically

The new module **MUST NOT** alter behaviour in any of:

- `lib/marketplace-cart-server.ts`, `lib/marketplace-cart-pricing.ts`
- `app/api/cart/preview/route.ts`, `app/api/cart/checkout/route.ts`
- `app/api/listings/[id]/service-booking/route.ts`, `.../agreed-price/route.ts`
- `lib/service-booking-pricing.ts`, `lib/booking-checkout-guard.ts`, `lib/booking-lifecycle.ts`
- `lib/payment-confirmed-chat.ts`, `lib/contact-gate.ts`
- `app/api/provider-signup/route.tsx`
- `app/api/stripe/connect/onboarding/route.ts`
- `app/api/bookings/*`
- `components/listings/ListingsMap.tsx`

Allowed: pure additions (new exports) only if no existing caller's behaviour changes.

### G2. Surgical edits permitted, fully tested

The only existing files that may be **edited additively** are:

| File | Edit | Test gate |
|---|---|---|
| `lib/listing-category.ts` | Add `isRideListing()` helper (new export) | Existing `isServicesListing()` tests still green |
| `lib/csp.mjs` | Append Mapbox + Meta WhatsApp domains | CSP enforce-mode smoke test still green |
| `app/api/webhooks/stripe/route.ts` | Add new branch for `metadata.purpose === "wallet_topup"` | All existing webhook branches still triggered correctly |
| Supabase `listings` table | Add nullable `subcategory_kind TEXT` column | All existing listing queries return identical results when column is NULL |
| `package.json` | Add `mapbox-gl`, `@mapbox/mapbox-sdk` to deps | `npm install` succeeds, no peer dep conflicts |

No other existing file is touched in v1.

### G3. Master kill switch

Env var `RIDES_ENABLED=false` (default) means:
- No `/api/rides/*` route is reachable (returns 404).
- No `ride-ai/` service traffic is accepted (returns 503).
- No background workers run rides-related jobs.
- `isRideListing()` always returns `false` so any ride listing in DB is treated as a regular service listing (harmless if `subcategory_kind` is somehow set in dev).

The flag is checked at the **route entry point** and at the **AI worker entry point**, not deep in business logic, so flipping it off is instant and reversible.

### G4. One-way dependency

- Next.js code **never imports** anything from `ride-ai/`.
- Next.js code **may call** `ride-ai/` over HTTP only via `lib/rides/ai-client.ts` (new file) which fails open (no-op) if `RIDES_ENABLED=false`.
- `ride-ai/` calls Next.js **only** via `/api/rides/*` with `X-Internal-Secret`.

If `ride-ai/` is offline, all non-rides functionality continues unchanged. If Next.js is offline, `ride-ai/` returns 503 to inbound WhatsApp webhooks (Meta retries).

---

## 4. High-level architecture

```text
                    ┌──────────────────────────────────────────────────┐
                    │  EXISTING NEXT.JS APP — unchanged behaviour      │
                    │  Marketplace cart · Services · Provider signup   │
                    │  Stripe Connect · Listings map · WhatsApp deep   │
                    │  links · in-app chat · booking lifecycle         │
                    └──────────────────────────────────────────────────┘
                          ▲                              ▲
                          │                              │
                          │ HTTP (X-Internal-Secret)     │ Stripe webhooks
                          │                              │ (one new branch only)
                          │                              │
                    ┌─────┴──────────────────────────────┴──────────────┐
                    │  NEW RIDES MODULE (inside Next.js, flag-gated)    │
                    │  /app/api/rides/*                                 │
                    │  /lib/rides/*                                     │
                    │  Tables: wallets, wallet_ledger, driver_profiles, │
                    │          ride_bookings, ride_events               │
                    │  All money math, state transitions, fraud, pricing│
                    └───────────────────────────────────────────────────┘
                          ▲
                          │  HTTP (X-Internal-Secret)
                          │  one-way — Next.js never calls back
                          │
                    ┌─────┴─────────────────────────────────────────────┐
                    │  NEW ride-ai/ FastAPI service (Python)            │
                    │  LangGraph state machines · LangChain tools       │
                    │  Mapbox SDK · Anthropic + OpenAI · Upstash Redis  │
                    │  Inbound: Meta WhatsApp Cloud API webhook         │
                    │  Outbound: WhatsApp template messages             │
                    └───────────────────────────────────────────────────┘
```

Sibling Python services already in the repo (`fastapi/`, `ml-service/`, `listings-api/`) are not touched.

---

## 5. The five modules

Three are LLM-driven (genuine LangGraph agents). Two are deterministic services callable as tools by the agents — explicitly **not** LLM-based.

| # | Module | Type | LLM? | Lives in | Responsibility |
|---|---|---|---|---|---|
| 1 | Booking Agent | LangGraph agent | Yes (cheap model: Haiku / 4o-mini) | `ride-ai/` | Parse WhatsApp messages, extract pickup/dropoff/time/passengers/luggage/language, orchestrate booking by calling deterministic tools |
| 2 | Support Agent | LangGraph agent | Yes (cheap + escalation to bigger model) | `ride-ai/` | Triage top issues (lost item, fare dispute, ETA question, cancellation, receipt), execute refunds via tools, escalate to human |
| 3 | Communication Agent | Template engine + optional LLM | Mostly no; LLM for translation only | `ride-ai/` | Render WhatsApp templates, handle ES/EN, format receipts |
| 4 | Pricing Service | Deterministic | **No** | Next.js `lib/rides/ride-pricing.ts` | `base + distance × per_km + time × per_min` plus surge multiplier from zone/time rules |
| 5 | Fraud Service | Deterministic | **No** | Next.js `lib/rides/ride-fraud.ts` | Rule-based: off-platform contact patterns, location anomalies, cancellation velocity, duplicate rides, suspicious top-ups |

**Why pricing and fraud are not LLM agents:** money math must be reproducible, auditable, and unit-testable. Fraud suspension affects driver livelihoods; we cannot defend an LLM-driven decision in a dispute. LLMs may *flag* for human review later (v2), but never auto-suspend.

### Tool surface available to the Booking Agent

The Booking Agent is constrained to these typed Pydantic tool calls (no free-form actions):

- `geocode(address: str) -> Coordinates`
- `reverse_geocode(lat: float, lng: float) -> Address`
- `estimate_fare(origin, destination, when) -> FareEstimate` (calls Next.js `/api/rides/pricing/estimate`)
- `check_wallet_balance(user_id) -> Balance` (calls Next.js)
- `create_oxxo_topup(user_id, amount_mxn_cents) -> VoucherUrl` (calls Next.js)
- `create_ride_booking(...) -> RideBooking` (calls Next.js)
- `find_nearby_drivers(geo, radius_m) -> [Driver]` (calls Next.js, which uses Mapbox Matrix)
- `assign_driver(ride_id, driver_id) -> AssignmentResult` (calls Next.js)
- `run_fraud_checks(ride_id) -> FraudResult` (calls Next.js)
- `send_whatsapp(user_id, template_id, variables) -> MessageId`

The LLM may **request** a transition; Next.js **validates and executes**. Money never moves on LLM judgement alone.

---

## 6. Database changes (additive only)

All changes are new tables plus one nullable column. **No existing table is mutated, dropped, or had a NOT NULL constraint added.**

### New tables

```sql
-- Wallets and append-only ledger
CREATE TABLE wallets (
  user_id          UUID PRIMARY KEY REFERENCES users(id),
  balance_mxn_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_mxn_cents >= 0),
  held_mxn_cents   BIGINT NOT NULL DEFAULT 0 CHECK (held_mxn_cents >= 0),
  version          BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  kind             TEXT NOT NULL CHECK (kind IN
                     ('load','load_bonus','hold','release','capture','refund','payout_debit','adjustment')),
  amount_mxn_cents BIGINT NOT NULL,
  ride_booking_id  UUID NULL,
  stripe_pi_id     TEXT NULL,
  oxxo_voucher_id  TEXT NULL,
  meta             JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_ledger_user_idx ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX wallet_ledger_ride_idx ON wallet_ledger(ride_booking_id);

-- Driver profile (1:1 with users when user is a verified ride driver)
CREATE TABLE driver_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id),
  license_number       TEXT NOT NULL,
  license_expiry       DATE NOT NULL,
  license_photo_url    TEXT NOT NULL,
  vehicle_make         TEXT NOT NULL,
  vehicle_model        TEXT NOT NULL,
  vehicle_year         INT NOT NULL,
  vehicle_color        TEXT NOT NULL,
  vehicle_plates       TEXT NOT NULL,
  vehicle_card_photo_url TEXT NOT NULL,
  insurance_provider   TEXT NOT NULL,
  insurance_policy     TEXT NOT NULL,
  insurance_expiry     DATE NOT NULL,
  insurance_photo_url  TEXT NOT NULL,
  background_check_status TEXT NOT NULL DEFAULT 'none'
                       CHECK (background_check_status IN ('none','pending','passed','failed')),
  is_active_driver     BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ride bookings (separate from service_bookings — different lifecycle)
CREATE TABLE ride_bookings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                 UUID NOT NULL REFERENCES users(id),
  driver_id                UUID NULL REFERENCES users(id),
  listing_id               UUID NULL REFERENCES listings(id),
  status                   TEXT NOT NULL DEFAULT 'requested'
                           CHECK (status IN ('requested','matched','accepted','arrived',
                                             'in_trip','completed','cancelled','disputed')),
  pickup_lat               DOUBLE PRECISION NOT NULL,
  pickup_lng               DOUBLE PRECISION NOT NULL,
  pickup_address           TEXT NOT NULL,
  dropoff_lat              DOUBLE PRECISION NOT NULL,
  dropoff_lng              DOUBLE PRECISION NOT NULL,
  dropoff_address          TEXT NOT NULL,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at               TIMESTAMPTZ NULL,
  trip_started_at          TIMESTAMPTZ NULL,
  trip_ended_at            TIMESTAMPTZ NULL,
  passengers               INT NOT NULL DEFAULT 1,
  luggage                  TEXT NULL,
  language                 TEXT NULL,
  estimated_total_mxn_cents BIGINT NOT NULL,
  hold_amount_mxn_cents    BIGINT NOT NULL,
  final_total_mxn_cents    BIGINT NULL,
  commission_mxn_cents     BIGINT NULL,
  tip_mxn_cents            BIGINT NULL DEFAULT 0,
  distance_m               INT NULL,
  duration_s               INT NULL,
  cancel_reason            TEXT NULL,
  ticket_code              TEXT NULL UNIQUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ride_bookings_buyer_idx  ON ride_bookings(buyer_id, created_at DESC);
CREATE INDEX ride_bookings_driver_idx ON ride_bookings(driver_id, created_at DESC);
CREATE INDEX ride_bookings_status_idx ON ride_bookings(status, created_at DESC);

-- Ride event log (parallels booking_events for service_bookings)
CREATE TABLE ride_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       UUID NOT NULL REFERENCES ride_bookings(id),
  actor_id      UUID NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT NULL,
  to_status     TEXT NULL,
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ride_events_ride_idx ON ride_events(ride_id, created_at DESC);
```

### Single additive column on existing table

```sql
ALTER TABLE listings ADD COLUMN subcategory_kind TEXT NULL;
-- Existing rows: NULL → treated exactly as today by all current code.
-- New ride listings: 'ride' → routed to ride flow by new code only.
```

### RLS policies

Each new table gets its own RLS policies (buyer sees own wallet/rides, driver sees assigned rides, service role bypasses). Existing tables' policies are not modified.

---

## 7. New routes (Next.js)

All under `/api/rides/*` namespace. **Every route returns 404 if `RIDES_ENABLED=false`.**

| Route | Method | Purpose |
|---|---|---|
| `/api/rides/wallet` | GET | Buyer's balance + held + recent ledger |
| `/api/rides/wallet/topup` | POST | Create Stripe OXXO PaymentIntent, return voucher URL |
| `/api/rides/request` | POST | Buyer creates ride request (estimate + hold) |
| `/api/rides/[id]` | GET | Ride status + lifecycle |
| `/api/rides/[id]/cancel` | POST | Cancel pre-trip (with policy) |
| `/api/rides/[id]/match` | POST | (internal) Assign driver, place wallet hold |
| `/api/rides/[id]/accept` | POST | Driver accepts assignment |
| `/api/rides/[id]/arrive` | POST | Driver marks arrived at pickup |
| `/api/rides/[id]/start` | POST | Driver starts trip (requires ticket_code from buyer) |
| `/api/rides/[id]/complete` | POST | Driver ends trip, capture from wallet |
| `/api/rides/[id]/tip` | POST | Buyer adds tip post-trip |
| `/api/rides/[id]/dispute` | POST | Buyer disputes fare |
| `/api/rides/pricing/estimate` | POST | Pure pricing math (callable by AI tools) |
| `/api/rides/drivers/nearby` | POST | Dispatch matrix call (callable by AI tools) |
| `/api/rides/drivers/me/online` | POST | Driver toggles online + reports GPS |
| `/api/driver-signup` | POST | New route reusing user/listing primitives |

All routes that mutate state require: auth, `RIDES_ENABLED=true`, and (for AI-callable routes) `X-Internal-Secret` header matching `ride-ai/`.

---

## 8. Driver onboarding extension

**Reuses ~80% of existing service provider primitives.** See `app/api/provider-signup/route.tsx` for the pattern.

| Reused as-is | Added for drivers |
|---|---|
| `users` find-or-create by phone | `driver_profiles` row (vehicle + license + insurance) |
| CURP/RFC capture | Vehicle plates + tarjeta de circulación photo |
| `is_verified = false` admin gate | `driver_profiles.is_active_driver = false` admin gate |
| Twilio WhatsApp admin notification | Same Twilio path, different template |
| `rateLimitListingCreateByUser` | Same |
| Stripe Connect onboarding | Same |
| COLONIAS-based location | Service zones (multiple colonias) |
| Listing creation in `listings` | Same, with `subcategory_kind = 'ride'` |

The new route `/api/driver-signup` lives alongside `/api/provider-signup` and shares helpers extracted into `lib/rides/driver-onboarding.ts`. The existing provider-signup route is **not modified**.

---

## 9. Wallet + OXXO funding (the foundation)

### Flow

1. Buyer opens "Saldo Naranjo" screen → sees balance + ledger.
2. Taps "Cargar saldo" → picks amount → POST `/api/rides/wallet/topup`.
3. Server creates Stripe PaymentIntent with `payment_method_types: ['oxxo']`, returns hosted voucher URL.
4. Buyer shows barcode at OXXO, pays cash.
5. Stripe sends `payment_intent.succeeded` webhook (3DS-style flow for OXXO completion).
6. Webhook handler **adds a new branch** to `app/api/webhooks/stripe/route.ts` checking `metadata.purpose === "wallet_topup"`:
   - Insert `wallet_ledger` row (`kind = 'load'`)
   - Upsert `wallets.balance_mxn_cents` (atomic with version check)
   - Optional bonus credit (`kind = 'load_bonus'`)
   - Send WhatsApp confirmation
7. Buyer can now spend balance on rides (or, in v2, on cart/services).

### Hold / capture for rides

- **At match time**: insert `kind = 'hold'` for `estimated × 1.5`; check `balance >= held + new_hold`.
- **At completion**: insert `kind = 'release'` for the full hold, then `kind = 'capture'` for the actual fare, then `kind = 'capture'` against driver wallet (negative) for the platform commission.
- The ledger is append-only; `balance` and `held` are derived columns kept in sync via DB triggers (`AFTER INSERT ON wallet_ledger`).

### Why this prevents cash bypass

- Buyer's money is **already on the platform** before the ride starts.
- Driver can only get paid by completing the in-app flow (which assigns ticket_code and captures from wallet).
- No driver wallet credit = no Stripe Connect transfer at end of week.
- Rides started without in-app "Start" trigger a fraud rule and an admin flag.

---

## 10. Map provider strategy

| Use case | Provider | Rationale |
|---|---|---|
| Existing listings map (`ListingsMap.tsx`) | **Leaflet + OSM** (unchanged) | Free, working, no reason to touch |
| Ride-side display map (live trip, driver position) | **Mapbox GL JS** | Vector tiles, cheaper than Google |
| Geocoding (address → coords) | **Mapbox Geocoding** | ~10× cheaper than Google |
| Routing / ETA | **Mapbox Directions** | Sufficient for v1; upgrade to Google later if CDMX traffic accuracy bites |
| Driver dispatch (one rider → N drivers) | **Mapbox Matrix** | Built for exactly this; what Uber uses internally |
| GPS snap-to-road | **Mapbox Map Matching** | Cleans phone GPS jitter |

CSP impact: add `api.mapbox.com`, `events.mapbox.com`, and `*.tiles.mapbox.com` to `connect-src` / `img-src` in `lib/csp.mjs`. Additive only.

---

## 11. AI orchestrator (`ride-ai/`)

New Python FastAPI service. Mirrors `ml-service/` conventions exactly.

### Folder structure

```text
ride-ai/
├── app/
│   ├── main.py                       # FastAPI app, X-Internal-Secret auth
│   ├── config.py                     # Settings
│   ├── redis_client.py               # Upstash Redis (reuse pattern)
│   ├── graph/
│   │   ├── booking_graph.py          # LangGraph state machine
│   │   ├── support_graph.py
│   │   └── checkpoint.py             # Redis-backed checkpointer
│   ├── agents/
│   │   ├── booking_agent.py
│   │   ├── support_agent.py
│   │   └── communication.py
│   ├── tools/
│   │   ├── rides_api.py              # Typed HTTP client → Next.js
│   │   ├── mapbox.py
│   │   ├── pricing.py                # Just calls Next.js — no LLM
│   │   └── fraud.py                  # Just calls Next.js — no LLM
│   ├── routers/
│   │   ├── whatsapp_webhook.py       # Meta inbound
│   │   └── ops.py                    # /health, /metrics
│   └── schemas.py                    # Pydantic
├── tests/                            # See §13
├── requirements.txt
├── Dockerfile                        # Copy ml-service/Dockerfile pattern
├── .env.example
└── README.md
```

### Deployment

Railway, same pattern as `ml-service`. Independent service, independent scaling.

### LLM cost envelope

Per ride: ~2-3 calls, ~0.0005 USD total at Haiku/4o-mini pricing. At 10K rides/month ≈ 5 USD/month. Escalation model (Sonnet/4o) reserved for support escalations only.

---

## 12. Phased delivery plan

Each phase is **independently shippable** behind the flag and **independently testable**. Production rollout of a phase requires its acceptance gate (§13) to pass.

| Phase | Scope | Touches existing code? | Duration |
|---|---|---|---|
| **0. Foundation** | Wallet + ledger + OXXO top-up + Stripe webhook branch + CSP edit | One additive webhook branch | 2–3 wks |
| **1. Driver onboarding** | `driver_profiles` table, `/api/driver-signup`, admin verification | No (new route only) | 1 wk |
| **2. WhatsApp integration** | Meta Cloud API setup, template approval, inbound webhook, Twilio→Meta migration of admin notifications | Parallel — admin notify keeps Twilio fallback | 1 wk (+ Meta approval lag) |
| **3. Booking Agent + dispatch** | `ride-ai/` skeleton, BookingAgent, deterministic dispatch using Mapbox Matrix | No | 2–3 wks |
| **4. Trip lifecycle + wallet hold/capture** | Driver app screens (start/end), GPS reporting, hold/capture against wallet | No | 2 wks |
| **5. Support Agent + dispute flow** | Top-5 issues handled autonomously, dispute queue in admin | No | 1–2 wks |
| **6. Soft launch** | 1 city (proposed: San Miguel de Allende), 10–20 vetted drivers, invite-only | — | 1 wk |
| **Total to soft launch** | | | **~10–13 wks** |

---

## 13. Testing strategy

This section is the contract for "bullet-proof end-to-end". Every phase has an explicit acceptance gate; no phase merges to `main` (even behind the flag) until its gate is green.

### 13.1. Layered test suite

```text
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5: Manual E2E checklists  (per phase, before flag flip)   │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: Shadow tests in staging  (real Stripe test mode,       │
│          real Mapbox, real Meta WhatsApp Cloud API sandbox)     │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: Integration tests  (Next.js routes + Python service    │
│          spun up together in CI, real Supabase test project)    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Contract tests  (Stripe webhook fixtures, Meta WhatsApp│
│          fixtures, Mapbox response fixtures)                    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1: Unit tests  (pure deterministic libs — pricing,        │
│          fraud rules, wallet ledger math, lifecycle transitions)│
└─────────────────────────────────────────────────────────────────┘
```

### 13.2. Regression tests for existing flows — **the bullet-proof gate**

Before any new code merges, these existing-flow tests must pass on **the new branch**:

| Existing flow | Test script | What it verifies |
|---|---|---|
| Marketplace cart goods checkout | `scripts/test-cart-checkout.ts` (NEW — add to mirror existing pattern) | Cart pricing math + Stripe Connect application fee unchanged |
| Fixed-price service booking — full Connect | `scripts/test-service-booking-full-connect.ts` (EXISTING) | Existing deterministic + live smoke still green |
| Messaging / WhatsApp | `scripts/test-messaging.ts` (EXISTING) | Existing notifications unchanged |
| Booking buyer notify | `scripts/check-booking-buyer-notify.ts` (EXISTING) | Buyer notifications unchanged |
| Provider signup | `scripts/test-provider-signup.ts` (NEW) | Signup + Twilio admin notify unchanged |
| Stripe webhook — non-rides branches | `scripts/test-webhook-existing-branches.ts` (NEW) | Replay every existing webhook event type, assert behaviour byte-identical |
| Listings map render | Playwright snapshot test (NEW) | OSM tile load + marker click navigates unchanged |
| CSP enforcement | `scripts/test-csp.ts` (NEW) | Existing CSP-blocked origins still blocked |

These run on every PR. Any diff in observable behaviour = PR blocked.

### 13.3. New-feature tests per phase

#### Phase 0 — Wallet + OXXO

**Unit tests** (`lib/rides/__tests__/`)
- Wallet ledger math: load → balance increases; hold → held increases, balance unchanged; release → held decreases; capture → balance decreases.
- Negative balance prevented (CHECK constraint + app-level guard).
- Concurrent hold race (two requests, only one hold succeeds).
- Bonus credit calculation.

**Contract tests**
- Stripe webhook fixture: `payment_intent.succeeded` with `metadata.purpose=wallet_topup` → ledger insert + WhatsApp confirmation.
- Stripe webhook fixture: `payment_intent.succeeded` *without* that metadata → existing behaviour, no ledger insert.
- Stripe webhook idempotency: same event replayed twice → exactly one ledger entry.

**Integration tests**
- Full top-up flow against Stripe test mode: create intent → simulate OXXO succeed → assert ledger + balance.

**Acceptance gate**
- 100% unit coverage on `wallet-server.ts` and `wallet-oxxo.ts`.
- All regression tests in §13.2 still green.
- Manual checklist: load 100 MXN → see balance, view ledger, see WhatsApp confirmation.

#### Phase 1 — Driver onboarding

- Unit tests for `driver_profiles` validators (license format, plates format, year range).
- Integration: POST `/api/driver-signup` with valid + invalid payloads.
- Regression: POST to `/api/provider-signup` still produces identical DB state to today (compare with pre-merge snapshot).

#### Phase 2 — WhatsApp Cloud API

- Contract tests: every approved Meta template renders correctly with mock variables.
- Inbound webhook signature validation tests.
- Failure mode: Meta API down → Twilio fallback for admin notifications (existing path) still works.

#### Phase 3 — Booking Agent + dispatch

**LangGraph deterministic test harness** — this is critical: we run LangGraph with a **mocked LLM** that returns canned tool calls, so the graph itself is unit-testable.

- Test: "Necesito un taxi de Plaza Cívica a Hotel California ahora" → mock LLM returns `geocode("Plaza Cívica")` → assert correct ride created.
- Test: Wallet short → mock LLM returns `create_oxxo_topup(...)` → assert top-up voucher returned, ride not yet created.
- Test: No drivers found → assert ride status `cancelled`, buyer notified, no money moved.
- Test: LLM hallucinates a non-existent driver_id → tool layer rejects, no DB write.

**Live (smoke) tests** with real LLM in staging — `--live` flag like the existing pattern, ~5 representative scenarios.

#### Phase 4 — Trip lifecycle + wallet hold/capture

- State machine tests: every valid transition + every invalid transition.
- "Driver doesn't start in-app" → completion is impossible → no payout → fraud event logged.
- Concurrent state changes (race: buyer cancels while driver accepts).
- Hold/capture/release math under all paths (normal, cancel pre-match, cancel post-match, complete with tip, complete then dispute).

#### Phase 5 — Support Agent

- Each of the top-5 supported issues tested with canonical user phrasings (ES + EN).
- Escalation: when LLM is uncertain (low confidence), route to human queue (not auto-respond).
- Refund execution: LLM may *request* a refund, but the deterministic refund function validates eligibility (only within X minutes of completion, only once per ride).

### 13.4. End-to-end "golden ride" test

The headline test that must pass before any soft launch:

1. Buyer A (test account) loads 200 MXN via OXXO test voucher → ledger `load` 20000c, `load_bonus` 1000c.
2. Buyer A sends WhatsApp: "Taxi a aeropuerto en 10 minutos" → Booking Agent extracts → geocode → fare estimate 150 MXN → wallet hold 22500c.
3. System matches Driver B (test driver) → assignment WhatsApp to driver.
4. Driver B accepts → "arrived" → enters ticket_code → "start".
5. Driver B "complete" with final fare 145 MXN.
6. System captures: wallet `release` 22500c, `capture` 14500c against buyer, commission 1450c to platform, 13050c credited to driver wallet.
7. Buyer A adds 20 MXN tip → `capture` 2000c to driver.
8. Driver B's weekly Stripe Connect payout receives all credited amounts minus the existing application fee.
9. **Existing service booking made in parallel** during the same test window completes normally with no behaviour change.
10. **Existing cart purchase made in parallel** completes normally with no behaviour change.

This test runs as `scripts/test-rides-golden-e2e.ts` against staging.

### 13.5. Manual QA checklist (per phase, before flag flip)

A markdown checklist in `docs/qa/` per phase. Reviewers must sign off line by line.

### 13.6. Production rollout gates

- Flag stays `false` in production until staging golden E2E is green for 7 consecutive days.
- Soft launch: flag on for **internal users only** (allowlist by user_id).
- Beta: 10–20 invited drivers + 50 invited buyers, monitor for 2 weeks.
- General availability: only after zero P0/P1 incidents in beta.

### 13.7. Observability — what we monitor on day one

- Wallet ledger entries / second (sanity: no runaway loops).
- Wallet sum vs. ledger sum reconciliation (run hourly, page on mismatch).
- Stripe webhook lag.
- LLM call cost per ride (page if > 0.01 USD).
- LangGraph checkpoint size (page if > 10KB per conversation — indicates a loop).
- Fraud rule trigger rates.
- Existing flows: per-route p50/p95 latency vs. pre-merge baseline (any 10% regression pages).

---

## 14. Feature flags & kill switches

| Flag | Default | Effect when `false` |
|---|---|---|
| `RIDES_ENABLED` | `false` | All `/api/rides/*` return 404; `isRideListing()` always false; `ride-ai/` returns 503 |
| `RIDES_AI_ENABLED` | `false` | Rides still work, but no Booking/Support agent — buyers use structured form fallback |
| `RIDES_WALLET_OXXO_ENABLED` | `false` | Top-ups disabled (existing balances still spendable) |
| `RIDES_ALLOWLIST_USER_IDS` | empty | Only these users see the rides UI even if flag is on |

Flags read at request boundary, not deep in business logic. Toggling is instant and reversible.

---

## 15. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM hallucinates a booking with wrong destination | M | M | Strict Pydantic tool schemas; buyer confirms via WhatsApp before money moves |
| OXXO payment delay confuses buyers | H | L | Show "pendiente" state, ETA messaging, push WhatsApp on success |
| Driver attempts cash-side deal | H | M | Ticket code required to start; rides without in-app start = no payout + fraud flag |
| Meta WhatsApp template rejection | M | M | Submit early (Phase 2 starts in parallel); fall back to Twilio for admin notify |
| Mapbox Mexico routing accuracy in CDMX | M | M | Start in SMA (smaller city) first; option to swap to Google for routing only |
| Wallet/ledger drift (sum mismatch) | L | H | Hourly reconciliation cron; page on mismatch; ledger is source of truth, balance is derived |
| Regulatory: ride-hailing registration | M | H | Verify state-by-state regs before opening each city; SMA first (lower regulatory bar than CDMX) |
| AI service outage during rides | L | M | Structured form fallback; existing service bookings unaffected |
| LLM cost spike | L | L | Per-conversation token cap; cost alarm; cheap model only for routing |

---

## 16. Open decisions

These do **not** block Phase 0 but must be resolved before later phases.

1. **First city/zone** for soft launch. Recommendation: San Miguel de Allende (COLONIAS data already exists).
2. **LLM provider primary**: Anthropic Haiku vs. OpenAI 4o-mini. Recommendation: Haiku primary, 4o-mini fallback.
3. **Driver location reporting cadence**: every 5s when online, every 10s in trip? Recommendation: 5s in trip, 15s when idle, off when offline. Power-sensitive — refine after driver feedback.
4. **Tip cap**: max 30% of fare? Soft cap of 20% with optional manual increase? Recommendation: 25% soft cap, 50% hard cap.
5. **Cancel policy**: free cancel within 2 min of match; 30 MXN fee after. Confirm.
6. **Background check provider**: defer to v2 (manual review by admin for v1 launch).

---

## 17. Decision log (locked-in choices)

| # | Decision | Rationale |
|---|---|---|
| D1 | AI worker is Python/FastAPI, new `ride-ai/` service | Python already first-class (`ml-service`, `fastapi/`, `listings-api`); LangGraph ecosystem more mature in Python |
| D2 | Stripe only for v1 (no Mercado Pago) | OXXO supported natively by Stripe MX; single payout pipeline; reuse existing Connect plumbing |
| D3 | Mapbox for ride APIs, keep Leaflet+OSM for existing listings map | ~10× cheaper than Google; existing map untouched |
| D4 | 3 LLM agents + 2 deterministic services, not 5 LLM agents | Money math and fraud must be reproducible and defendable |
| D5 | Wallet-first architecture (Phase 0 before any AI work) | Foundation for cash-bypass prevention; useful even without taxi |
| D6 | Driver onboarding forks `/api/driver-signup` (does not edit `/api/provider-signup`) | Preserves existing service provider flow byte-for-byte |
| D7 | One additive nullable column on `listings.subcategory_kind`; no other existing-table mutations | Hard isolation guarantee |

---

## 18. Approval

Before implementation starts, the following must be signed off:

- [ ] §3 Existing-flow protection guarantees accepted as the contract
- [ ] §6 Database changes accepted (new tables + one nullable column)
- [ ] §13 Testing strategy accepted as the merge gate
- [ ] §16 Open decisions assigned owners and target dates
- [ ] First-city/zone decision (D-pending)

Once signed off, implementation begins at **Phase 0** (wallet + OXXO).
