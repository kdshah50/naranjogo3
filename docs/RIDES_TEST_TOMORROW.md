# Rides — Manual test guide (preview)

> **Full all-phases guide (Phases 0–4):** open **[`RIDES_FULL_MANUAL_TEST.docx`](./RIDES_FULL_MANUAL_TEST.docx)** in Microsoft Word, or edit **[`RIDES_FULL_MANUAL_TEST.md`](./RIDES_FULL_MANUAL_TEST.md)** in the repo.  
> Regenerate Word file: `python3 docs/generate-rides-test-docx.py`

Use this on the **Vercel preview** for branch `rides-setup`. Production (`naranjogo.com.mx`) has rides **off** — do not test there.

| When | What |
|------|------|
| **Tomorrow (Thu/Fri)** | Base stack: wallet, driver, booking, optional WhatsApp — find obvious breaks |
| **Sat–Sun** | **Full lifecycle**: match → hold → accept → start → complete → tip/cancel |

Bookmark your **preview URL** (it changes if you redeploy). Drafts and cookies are per-origin.

---

## 0. One-time setup (do before tomorrow)

### 0.1 Branch & deploy

```bash
git checkout rides-setup && git pull
```

Confirm latest deploy on Vercel for `rides-setup`.

### 0.2 Vercel env (Preview only)

| Variable | Value |
|----------|--------|
| `RIDES_ENABLED` | `true` |
| `RIDES_WHATSAPP_INBOUND_ENABLED` | `true` (only if testing WhatsApp) |
| Stripe test keys | already on preview |
| Twilio vars | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |

Production stays `RIDES_ENABLED=false`.

### 0.3 Supabase migrations (run in SQL Editor, in order)

Run each file from `supabase/migrations/` if not already applied:

1. `20260516143000_rides_wallet_foundation.sql` — wallet (Phase 0)
2. `20260520120000_rides_driver_profiles.sql` — drivers (Phase 1)
3. `20260521120000_driver_docs_storage_bucket.sql` — bucket `driver-docs` (Phase 1)
4. `20260522120000_rides_bookings_foundation.sql` — ride_bookings (Phase 3)
5. `20260523120000_rides_phase4_driver_online.sql` — driver online/GPS (Phase 4)

**Storage:** Supabase → Storage → bucket `driver-docs` (private, jpeg/png/webp, 2MB) if migration didn’t create it.

### 0.4 Local unit tests (optional, 2 min)

```bash
npm run test:driver-onboarding
npm run test:ride-pricing
npm run test:ride-lifecycle
```

All should pass before preview testing.

---

## 1. Sample data (use these values)

### 1.1 Sample route (works today)

| Field | Sample value |
|-------|----------------|
| Pickup colonia | **centro** (Centro Histórico) |
| Dropoff colonia | **guadalupe** (Col. Guadalupe) |
| WhatsApp text | `taxi de centro a guadalupe` |
| Expected fare | **≥ $45 MXN** (minimum fare; short trip) |
| Expected hold | **~1.5× fare** (e.g. ~$68 MXN if fare is $45) |

**Does not work yet:** `Taxi from San Miguel to airport` (no AI/Mapbox — use colonias above).

### 1.2 Two test accounts

You need **two logins** for the full cycle (buyer + driver):

| Role | How to set up |
|------|----------------|
| **Buyer (pasajero)** | Your phone — login on preview via `/unete`, OTP |
| **Driver (conductor)** | Second phone **or** same phone only if you can switch sessions |

**Tip:** Use **your phone as buyer** and a **second device/phone as driver** (or incognito + driver phone) so both can stay logged in.

### 1.3 Sample driver signup (`/conductor`)

Use real-looking test data (preview only):

| Field | Sample |
|-------|--------|
| Name | `Test Conductor SMA` |
| WhatsApp | Driver’s phone (must receive OTP to log in as driver later) |
| Primary colonia | `centro` |
| Extra colonias | `guadalupe`, `san_antonio` |
| Plates | `GTO1234` |
| License | `GTO-12345678` |

After submit → admin approve (below).

### 1.4 Admin approve driver (Supabase SQL)

Replace `<DRIVER_USER_ID>` with `users.id` from the driver signup (or from `driver_profiles.user_id`):

```sql
-- Find pending drivers
SELECT dp.user_id, dp.is_active_driver, dp.service_colonias, l.id AS listing_id, l.is_verified
FROM driver_profiles dp
LEFT JOIN listings l ON l.seller_id::text = dp.user_id AND l.subcategory_kind = 'ride'
ORDER BY dp.created_at DESC
LIMIT 5;

-- Approve (run after you know user_id)
UPDATE listings
SET is_verified = true
WHERE subcategory_kind = 'ride' AND seller_id::text = '<DRIVER_USER_ID>';

UPDATE driver_profiles
SET is_active_driver = true
WHERE user_id = '<DRIVER_USER_ID>';
```

Verify:

```sql
SELECT user_id, is_active_driver, is_online, service_colonias
FROM driver_profiles
WHERE user_id = '<DRIVER_USER_ID>';
```

### 1.5 Buyer wallet (saldo)

| Action | Sample |
|--------|--------|
| Top-up amount | **$500 MXN** (Stripe test card on preview) |
| Page | `/saldo` |
| Minimum for one ride | Balance ≥ **hold** (~$70–100 MXN for centro→guadalupe) |

Check balance:

```sql
SELECT user_id, balance_mxn_cents, held_mxn_cents
FROM wallets
WHERE user_id = '<BUYER_USER_ID>';
```

(`user_id` in wallets is TEXT — same as JWT `sub`, lowercase UUID.)

---

## 2. Tomorrow — base test (Phases 0 → 3 + smoke on 4)

Goal: confirm each layer works **before** the weekend full ride. Check boxes as you go.

### Phase 0 — Wallet

- [ ] **2.1** Open preview → log in as **buyer**
- [ ] **2.2** Go to **`/saldo`** — page loads (not 404)
- [ ] **2.3** Top up **$500 MXN** with Stripe test card — success redirect
- [ ] **2.4** Balance shows **$500** (or prior balance + 500)
- [ ] **2.5** Supabase: `wallet_ledger` has row `kind = load`

**Pass if:** balance visible and ledger row exists.

---

### Phase 1 — Driver onboarding

- [ ] **2.6** Log in as **driver phone** (or submit signup first, approve, then login)
- [ ] **2.7** Open **`/conductor`** — 4-step form loads
- [ ] **2.8** Submit driver application (or skip if already submitted)
- [ ] **2.9** Run **admin approve SQL** (§1.4)
- [ ] **2.10** While logged in as driver: open DevTools → **`GET /api/rides/drivers/me`**
  - Expect: `can_receive_rides: true`, `listing.is_verified: true`

**Pass if:** driver approved in DB and API says can receive rides.

---

### Phase 3 — Booking (web)

**Driver first:** on **`/conductor/viajes`** tap **Conectar** (go online).

**Buyer:**

- [ ] **2.11** Log in as **buyer**
- [ ] **2.12** Open **`/viaje`**
- [ ] **2.13** Origen: **centro**, Destino: **guadalupe**
- [ ] **2.14** Click **Ver tarifa** — shows estimate ≥ $45 MXN and hold ~1.5×
- [ ] **2.15** Click **Pedir taxi**
- [ ] **2.16** Expect: status **`matched`**, ticket **`NG-XXXXXXXX`**

**Supabase checks:**

```sql
SELECT id, status, ticket_code, buyer_id, driver_id, estimated_total_mxn_cents, hold_amount_mxn_cents
FROM ride_bookings
ORDER BY created_at DESC
LIMIT 1;

SELECT event_type, to_status, created_at
FROM ride_events
WHERE ride_id = '<RIDE_ID>'
ORDER BY created_at;
```

Expect events: `ride_requested`, `driver_matched`, `wallet_hold_placed`.

```sql
SELECT kind, amount_mxn_cents, ride_booking_id
FROM wallet_ledger
WHERE ride_booking_id = '<RIDE_ID>'
ORDER BY created_at;
```

Expect: `kind = hold` after match.

- [ ] **2.17** **`/saldo`**: **Reservado (held)** increased; available balance reduced

**Pass if:** ride matched, ticket shown, hold in ledger.

**If no driver matched:** driver not approved, not online, `service_colonias` missing `centro`, or driver busy on another ride.

---

### Phase 2 — WhatsApp (optional tomorrow)

Skip if Twilio sandbox not configured.

- [ ] **2.18** Twilio Console → WhatsApp sandbox → webhook:
  `https://YOUR-PREVIEW.vercel.app/api/rides/whatsapp/inbound`
- [ ] **2.19** From **buyer’s WhatsApp** (same number as NaranjoGo user), send:
  `taxi de centro a guadalupe`
- [ ] **2.20** Reply with fare + ticket (if driver available)
- [ ] **2.21** Driver/buyer may get Twilio outbound messages (if configured)

**Pass if:** inbound message creates or confirms same flow as `/viaje`.

---

### Phase 4 — Smoke only (optional tomorrow)

Quick check that driver panel sees the trip (full cycle on weekend):

- [ ] **2.22** Log in as **driver** → **`/conductor/viajes`**
- [ ] **2.23** Trip appears with status **`matched`**
- [ ] **2.24** Tap **Aceptar viaje** — status → **`accepted`**

Stop here tomorrow unless you have time; finish **accept → arrive → start → complete** on Sat–Sun.

---

### Tomorrow — write down breaks

| Step | Pass/Fail | Notes |
|------|-----------|-------|
| 0 Migrations | | |
| 0 Wallet top-up | | |
| 1 Driver approve | | |
| 2 Viaje + match | | |
| 2 Hold in ledger | | |
| 3 WhatsApp | | |
| 4 Accept smoke | | |

---

## 3. Saturday–Sunday — full lifecycle (golden ride)

Same preview, same sample route **centro → guadalupe**. Fresh ride if needed.

### 3.1 Before you start

- [ ] Buyer saldo ≥ hold (~$70+ available after any prior holds)
- [ ] Driver **approved** + **Conectar** on `/conductor/viajes`
- [ ] No other active ride for same driver (`status` not in matched…in_trip)

### 3.2 End-to-end steps

| # | Who | Action | Expected |
|---|-----|--------|----------|
| 1 | Buyer | `/viaje` → pedir taxi centro → guadalupe | `matched`, ticket code |
| 2 | Supabase | `wallet_ledger` | `hold` row |
| 3 | Driver | `/conductor/viajes` → **Aceptar** | `accepted` |
| 4 | Driver | **Llegué al origen** | `arrived` |
| 5 | Driver | Enter **ticket code** → **Iniciar viaje** | `in_trip` |
| 6 | Driver | **Completar viaje** | `completed` |
| 7 | Supabase | ledger | `release`, `capture` (fare), `adjustment` (driver payout) |
| 8 | Buyer | `/saldo` | Balance down by fare; held back to 0 |
| 9 | Buyer | `/viaje` → propina **$20** | tip ledger; driver credited |
| 10 | Buyer | `/saldo` | Balance down another $20 |

**Commission:** platform keeps **10%** of fare; driver gets **90%** in wallet ledger (`adjustment`).

### 3.3 Verify completion in SQL

```sql
-- Replace IDs
SELECT status, ticket_code, estimated_total_mxn_cents, final_total_mxn_cents,
       commission_mxn_cents, tip_mxn_cents, trip_started_at, trip_ended_at
FROM ride_bookings
WHERE id = '<RIDE_ID>';

SELECT kind, amount_mxn_cents, meta
FROM wallet_ledger
WHERE ride_booking_id = '<RIDE_ID>'
ORDER BY created_at;

-- Buyer wallet
SELECT balance_mxn_cents, held_mxn_cents FROM wallets WHERE user_id = '<BUYER_USER_ID>';

-- Driver wallet (if driver topped up or has payout row)
SELECT balance_mxn_cents, held_mxn_cents FROM wallets WHERE user_id = '<DRIVER_USER_ID>';
```

### 3.4 Cancel test (second ride, optional)

1. Request another ride.
2. Within **2 minutes** of match: buyer **Cancelar viaje** on `/viaje`.
   - Expect: hold **released**, no $30 fee.
3. Third ride: wait **>2 min** after match, then cancel.
   - Expect: **$30 MXN** cancel fee (`capture_kind: cancel_fee` in ledger meta).

### 3.5 Weekend — write down breaks

| Step | Pass/Fail | Notes |
|------|-----------|-------|
| Match + hold | | |
| Accept → arrive | | |
| Start (ticket) | | |
| Complete + capture | | |
| Driver payout | | |
| Tip | | |
| Cancel policy | | |

---

## 4. API reference (debugging)

Preview base: `https://YOUR-PREVIEW.vercel.app`

Logged-in routes use session cookie. Internal routes need header `x-internal-secret: YOUR_INTERNAL_API_SECRET`.

```bash
PREVIEW="https://your-preview.vercel.app"
SECRET="your-internal-secret"

# Fare estimate (cookie or secret)
curl -s -X POST "$PREVIEW/api/rides/pricing/estimate" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $SECRET" \
  -d '{"pickup_colonia":"centro","dropoff_colonia":"guadalupe"}'

# Nearby drivers (secret only)
curl -s -X POST "$PREVIEW/api/rides/drivers/nearby" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $SECRET" \
  -d '{"pickup_colonia":"centro"}'

# Active rides (browser cookie — use DevTools Network instead)
# GET $PREVIEW/api/rides/active
```

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| `/saldo` or `/viaje` 404 | `RIDES_ENABLED` false on preview | Vercel Preview env |
| Pedir taxi → no match | Driver not approved / offline / wrong colonia | SQL §1.4, `/conductor/viajes` Conectar, check `service_colonias` includes `centro` |
| Insufficient saldo | Balance < hold | `/saldo` top-up |
| Hold fails after match | Balance too low at match time | Top up; request again |
| `drivers/me` → null | Wrong phone / duplicate users | Signup with same phone format as login; check `users` table |
| WhatsApp no reply | Webhook URL / flag | `RIDES_WHATSAPP_INBOUND_ENABLED`, Twilio URL |
| Wrong ticket on start | Typo | Copy `NG-XXXXXXXX` from buyer screen |
| Driver can’t login | OTP to different phone than signup | Use driver’s phone on `/unete` |

---

## 6. Not in scope until after weekend

- Free text **San Miguel → airport** (Phase 3 AI + Mapbox)
- Meta WhatsApp Cloud API (Twilio sandbox is enough)
- OXXO wallet top-up (`WALLET_TOPUP_OXXO_ENABLED`)
- Merge to `main` / production flag on

---

## 7. Quick links (preview)

| Page | Path |
|------|------|
| Saldo | `/saldo` |
| Pedir viaje | `/viaje` |
| Driver signup | `/conductor` |
| Driver trips | `/conductor/viajes` |
| Login | `/unete` |

---

*Last updated: consolidated guide for tomorrow base test + Sat–Sun full lifecycle on `rides-setup` preview.*
