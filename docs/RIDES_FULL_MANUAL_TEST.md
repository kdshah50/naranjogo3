# NaranjoGo Rides — Complete Manual Test Guide (Phases 0–4)

**Branch:** rides-setup  
**Environment:** Vercel Preview only (NOT production naranjogo.com.mx)  
**Document version:** May 2026  
**Phases covered:** 0 Wallet · 1 Driver onboarding · 2 WhatsApp · 3 Booking · 4 Trip lifecycle  

---

## Document purpose

Step-by-step checklist to test everything built on rides-setup through Phase 4. Use sample data provided. Check each box and fill Pass/Fail tables.

**Suggested schedule**

| Day | Sections to complete |
|-----|----------------------|
| Day 1 | Part A (setup) + Part B (Phase 0) + Part C (Phase 1) |
| Day 2 | Part D (Phase 3 web) + Part E (Phase 2 WhatsApp) |
| Day 3 | Part F (Phase 4 full lifecycle) + Part G (cancel/tip) |

---

## Part A — One-time setup (all phases)

### A.1 Get on the right branch

1. Open terminal.
2. Run: git checkout rides-setup
3. Run: git pull
4. Confirm Vercel shows latest deployment for rides-setup.
5. **Bookmark your preview URL:** ___________________________________

### A.2 Vercel environment (Preview)

| Step | Variable | Required value |
|------|----------|----------------|
| A.2.1 | RIDES_ENABLED | true |
| A.2.2 | RIDES_WHATSAPP_INBOUND_ENABLED | true (only for Phase 2 WhatsApp tests) |
| A.2.3 | Stripe test keys | sk_test_… / pk_test_… |
| A.2.4 | TWILIO_ACCOUNT_SID | From Twilio console |
| A.2.5 | TWILIO_AUTH_TOKEN | From Twilio console |
| A.2.6 | TWILIO_WHATSAPP_FROM | whatsapp:+… |
| A.2.7 | INTERNAL_API_SECRET | Any long random string (optional for manual UI tests) |

- [ ] A.2 done — preview env saved and redeployed if changed

### A.3 Supabase migrations (SQL Editor — run in order)

| Step | Migration file | Phase |
|------|----------------|-------|
| A.3.1 | 20260516143000_rides_wallet_foundation.sql | 0 |
| A.3.2 | 20260520120000_rides_driver_profiles.sql | 1 |
| A.3.3 | 20260521120000_driver_docs_storage_bucket.sql | 1 |
| A.3.4 | 20260522120000_rides_bookings_foundation.sql | 3 |
| A.3.5 | 20260523120000_rides_phase4_driver_online.sql | 4 |

- [ ] A.3.1 wallet tables created
- [ ] A.3.2 driver_profiles + listings.subcategory_kind
- [ ] A.3.3 storage bucket driver-docs (private, 2MB, jpeg/png/webp)
- [ ] A.3.4 ride_bookings + ride_events
- [ ] A.3.5 driver is_online + GPS columns

### A.4 Local unit tests (optional)

Run on your Mac:

1. npm run test:driver-onboarding
2. npm run test:ride-pricing
3. npm run test:ride-lifecycle

- [ ] All three scripts pass

---

## Part B — Sample test data (use for all phases)

### B.1 Test accounts

| Role | Phone / login | Notes |
|------|---------------|-------|
| Buyer (pasajero) | ___________________ | Your main phone — /unete OTP |
| Driver (conductor) | ___________________ | Second phone recommended |

Record user IDs after signup:

| Role | users.id (UUID) |
|------|-----------------|
| Buyer | ___________________ |
| Driver | ___________________ |

### B.2 Sample route (supported today)

| Item | Value |
|------|-------|
| Pickup colonia | centro (Centro Histórico) |
| Dropoff colonia | guadalupe (Col. Guadalupe) |
| WhatsApp message | taxi de centro a guadalupe |
| Minimum fare | $45 MXN |
| Typical hold | ~$68 MXN (1.5 × fare) |

**Not supported yet:** Taxi from San Miguel to airport (needs Phase 3 AI + Mapbox).

### B.3 Sample driver application (/conductor)

| Field | Sample value |
|-------|--------------|
| Name | Test Conductor SMA |
| WhatsApp | Driver phone number |
| CURP / RFC | Valid-format test values |
| Primary colonia | centro |
| Extra colonias | guadalupe, san_antonio |
| License | GTO-12345678 |
| Plates | GTO1234 |
| Vehicle | Nissan Versa 2020 Blanco |

### B.4 Stripe test card (preview top-up)

| Field | Value |
|-------|-------|
| Card | 4242 4242 4242 4242 |
| Expiry | Any future date |
| CVC | Any 3 digits |

---

## Part C — Phase 0: Wallet (Saldo Naranjo)

**Goal:** Buyer can load prepaid MXN balance and see ledger.

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| C.1 | Open preview URL | Site loads | [ ] |
| C.2 | Go to /unete — log in as buyer | OTP succeeds, session active | [ ] |
| C.3 | Navigate to /saldo | Page loads (not 404) | [ ] |
| C.4 | Note current balance | Shows $0 or prior balance | [ ] |
| C.5 | Select $500 MXN top-up | Stripe Checkout opens | [ ] |
| C.6 | Pay with test card 4242… | Redirect to success URL | [ ] |
| C.7 | Return to /saldo | Balance increased by $500 MXN | [ ] |
| C.8 | Supabase: query wallet_ledger | New row kind = load | [ ] |

**SQL verification (Phase 0):**

```sql
SELECT user_id, balance_mxn_cents, held_mxn_cents FROM wallets
WHERE user_id = '<BUYER_USER_ID>';

SELECT kind, amount_mxn_cents, created_at FROM wallet_ledger
WHERE user_id = '<BUYER_USER_ID>' ORDER BY created_at DESC LIMIT 5;
```

**Phase 0 sign-off**

| Tester | Date | Pass / Fail | Notes |
|--------|------|-------------|-------|
| | | | |

---

## Part D — Phase 1: Driver onboarding

**Goal:** Driver signs up, admin approves, API shows can_receive_rides.

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| D.1 | Log in as driver phone on /unete | OTP OK | [ ] |
| D.2 | Open /conductor | 4-step form visible | [ ] |
| D.3 | Complete steps 1–4 with sample data B.3 | Upload photos (≤2MB each) | [ ] |
| D.4 | Submit application | Success: Solicitud recibida | [ ] |
| D.5 | Supabase: check driver_profiles row | Row exists, is_active_driver = false | [ ] |
| D.6 | Supabase: check listings row | subcategory_kind = ride, is_verified = false | [ ] |
| D.7 | Run admin approve SQL (below) | Updates succeed | [ ] |
| D.8 | Browser DevTools → GET /api/rides/drivers/me | can_receive_rides: true | [ ] |

**Admin approve SQL:**

```sql
SELECT dp.user_id, dp.is_active_driver, dp.service_colonias,
       l.id AS listing_id, l.is_verified
FROM driver_profiles dp
LEFT JOIN listings l ON l.seller_id::text = dp.user_id AND l.subcategory_kind = 'ride'
ORDER BY dp.created_at DESC LIMIT 5;

UPDATE listings SET is_verified = true
WHERE subcategory_kind = 'ride' AND seller_id::text = '<DRIVER_USER_ID>';

UPDATE driver_profiles SET is_active_driver = true
WHERE user_id = '<DRIVER_USER_ID>';
```

**Phase 1 sign-off**

| Tester | Date | Pass / Fail | Notes |
|--------|------|-------------|-------|
| | | | |

---

## Part E — Phase 3: Booking and dispatch (web)

**Goal:** Buyer requests ride on /viaje, system prices, matches driver, places wallet hold.

**Prerequisite:** Phase 0 balance ≥ hold. Phase 1 driver approved.

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| E.1 | Log in as driver → /conductor/viajes | Page loads | [ ] |
| E.2 | Tap Conectar | is_online = true | [ ] |
| E.3 | Log in as buyer → /viaje | Form loads | [ ] |
| E.4 | Origen: centro, Destino: guadalupe | Colonias selected | [ ] |
| E.5 | Click Ver tarifa | Fare ≥ $45, hold ~1.5× shown | [ ] |
| E.6 | Click Pedir taxi | Success, no error | [ ] |
| E.7 | Note ticket code | NG-XXXXXXXX displayed | [ ] |
| E.8 | Note ride status | matched | [ ] |
| E.9 | /saldo — check Reservado | held amount increased | [ ] |
| E.10 | Supabase ride_bookings | status = matched, driver_id set | [ ] |
| E.11 | Supabase ride_events | ride_requested, driver_matched, wallet_hold_placed | [ ] |
| E.12 | Supabase wallet_ledger | kind = hold for ride | [ ] |

**SQL verification (Phase 3):**

```sql
SELECT id, status, ticket_code, buyer_id, driver_id,
       estimated_total_mxn_cents, hold_amount_mxn_cents
FROM ride_bookings ORDER BY created_at DESC LIMIT 1;

SELECT event_type, to_status FROM ride_events
WHERE ride_id = '<RIDE_ID>' ORDER BY created_at;

SELECT kind, amount_mxn_cents FROM wallet_ledger
WHERE ride_booking_id = '<RIDE_ID>';
```

**Phase 3 sign-off**

| Tester | Date | Pass / Fail | Notes |
|--------|------|-------------|-------|
| | | | |

---

## Part F — Phase 2: WhatsApp inbound (Twilio)

**Goal:** Same booking flow via WhatsApp text message.

**Prerequisite:** RIDES_WHATSAPP_INBOUND_ENABLED=true. Buyer WhatsApp = NaranjoGo user phone.

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| F.1 | Twilio Console → WhatsApp Sandbox | Sandbox active | [ ] |
| F.2 | Set webhook URL | https://YOUR-PREVIEW.vercel.app/api/rides/whatsapp/inbound | [ ] |
| F.3 | Driver online on /conductor/viajes | Conectar ON | [ ] |
| F.4 | From buyer phone, send to sandbox | taxi de centro a guadalupe | [ ] |
| F.5 | Read reply | Fare + ticket OR clear error message | [ ] |
| F.6 | Optional: Twilio outbound | Buyer/driver notification received | [ ] |
| F.7 | Supabase | New ride_bookings row (if new request) | [ ] |

**Phase 2 sign-off**

| Tester | Date | Pass / Fail | Notes |
|--------|------|-------------|-------|
| | | | |

---

## Part G — Phase 4: Full trip lifecycle

**Goal:** Driver completes trip; wallet release, capture, driver payout; buyer tip.

Use a fresh ride or continue from Phase E if still matched.

### G.1 Driver actions (/conductor/viajes)

| Step | Action | Expected status | Pass |
|------|--------|-----------------|------|
| G.1.1 | Aceptar viaje | accepted | [ ] |
| G.1.2 | Llegué al origen | arrived | [ ] |
| G.1.3 | Enter ticket NG-… → Iniciar viaje | in_trip | [ ] |
| G.1.4 | Completar viaje | completed | [ ] |

### G.2 Buyer after completion

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| G.2.1 | /viaje shows completed ride | Status completed | [ ] |
| G.2.2 | /saldo — balance reduced by fare | held = 0 | [ ] |
| G.2.3 | Add propina $20 MXN | Success | [ ] |
| G.2.4 | /saldo — balance down $20 more | Ledger shows tip capture | [ ] |

### G.3 SQL verification (Phase 4)

```sql
SELECT status, final_total_mxn_cents, commission_mxn_cents, tip_mxn_cents,
       trip_started_at, trip_ended_at
FROM ride_bookings WHERE id = '<RIDE_ID>';

SELECT kind, amount_mxn_cents, meta FROM wallet_ledger
WHERE ride_booking_id = '<RIDE_ID>' ORDER BY created_at;
-- Expect: hold → release → capture (fare) → adjustment (driver) → capture (tip) → adjustment (tip)
```

**Expected ledger sequence (normal completion):**

1. hold — reserves saldo at match  
2. release — frees hold at complete  
3. capture — fare from buyer (negative amount)  
4. adjustment — driver payout (~90% of fare)  
5. capture — tip from buyer (if tipped)  
6. adjustment — tip to driver  

**Phase 4 sign-off**

| Tester | Date | Pass / Fail | Notes |
|--------|------|-------------|-------|
| | | | |

---

## Part H — Phase 4: Cancel policy (optional)

| Step | Action | Expected result | Pass |
|------|--------|-----------------|------|
| H.1 | Request new ride centro → guadalupe | matched | [ ] |
| H.2 | Within 2 min: buyer Cancelar on /viaje | cancelled, hold released, no fee | [ ] |
| H.3 | Request another ride | matched | [ ] |
| H.4 | Wait >2 min after match | — | [ ] |
| H.5 | Buyer cancel | cancelled, $30 MXN fee if hold existed | [ ] |

---

## Part I — Master sign-off (all phases)

| Phase | Description | Pass / Fail | Date | Tester |
|-------|-------------|-------------|------|--------|
| 0 | Wallet / saldo | | | |
| 1 | Driver onboarding | | | |
| 2 | WhatsApp inbound | | | |
| 3 | Booking + dispatch | | | |
| 4 | Trip lifecycle + wallet | | | |
| 4b | Cancel policy | | | |

---

## Part J — Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| /saldo or /viaje returns 404 | RIDES_ENABLED false | Vercel preview env |
| No driver matched | Not approved / offline / wrong colonia | SQL approve; Conectar; service_colonias includes centro |
| Saldo insuficiente | Balance < hold | Top up on /saldo |
| Hold fails at match | Balance too low | Top up; retry |
| drivers/me returns null | Not logged in as driver | Use driver phone on /unete |
| WhatsApp no response | Webhook or flag | Check Twilio URL + RIDES_WHATSAPP_INBOUND_ENABLED |
| Invalid ticket on start | Wrong code | Copy exact NG-XXXXXXXX from buyer |
| Duplicate user rows | Phone format +52 vs 52 | Log out at /unete; re-login; see `supabase/scripts/reset-rides-drivers-test.sql` |
| “No active driver for this session” | Wrong `users` row / stale cookie | Log out; run reset SQL; one driver signup; approve in SQL |
| Clean slate for drivers | Old profiles + duplicate phones | Run `supabase/scripts/reset-rides-drivers-test.sql` in Supabase (preview only) |

---

## Part J2 — Reset all drivers (clean test)

**Preview / staging only.** In Supabase → **SQL Editor**, paste and run:

`supabase/scripts/reset-rides-drivers-test.sql`

Then:

1. Every tester **logs out** at `/unete` (or clears cookies for the preview domain).
2. **One** person completes `/conductor` signup with the test WhatsApp (e.g. 415 181 6902).
3. Admin runs the approve block at the bottom of that SQL file (`is_active_driver`, `is_verified`).
4. Driver opens `/conductor/viajes` → **Conectar**.

Optional: uncomment §4 in the script to delete duplicate `users` rows for the same phone (keep one id only).

---

## Part K — Quick reference URLs (preview)

| Page | Path |
|------|------|
| Login | /unete |
| Saldo | /saldo |
| Request ride | /viaje |
| Driver signup | /conductor |
| Driver trips | /conductor/viajes |

---

## Part L — Not built yet (do not test)

- AI Booking Agent (LangGraph / ride-ai full)  
- Mapbox geocoding (San Miguel → airport)  
- Meta WhatsApp Cloud API (production templates)  
- OXXO wallet top-up  
- Phase 5 Support agent  
- Production launch (main branch / RIDES_ENABLED on prod)  

---

*End of document — NaranjoGo Rides Phases 0–4 Manual Test Guide*
