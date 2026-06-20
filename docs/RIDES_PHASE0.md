# Phase 0 — Identity & test hygiene (before Mexico driver test)

Uber / DiDi require **one account per phone** and **no stuck trips**. Phase 0 fixes preview data and prevents new duplicates.

---

## What Phase 0 includes

| # | Item | Where |
|---|------|--------|
| 0.1 | Login picks canonical user; no duplicate insert on OTP | `findOrInsertLoginUserForPhone` |
| 0.2 | One-time DB merge (3 UUIDs → 1) | SQL scripts below |
| 0.3 | Auto-cancel stale rides >24h | Cron + SQL |
| 0.4 | One open ride per buyer | DB index + API guard |

---

## Run once in Supabase (preview) — ~15 min

### Step 1 — Phase 0 reset

Open **Supabase SQL Editor** → run entire file:

```
supabase/scripts/rides-phase0-preview-setup.sql
```

**Check output:**

- `open_rides_after` = **0**
- `open_rides_test_phones` = **0**

### Step 2 — Merge duplicate users (if needed)

If `duplicate_users` > **1**, run:

```
supabase/scripts/rides-one-driver-cleanup.sql
```

**Expected after:** exactly **1** user row for phone `524151816902`.

### Step 3 — Apply migration (if not on preview yet)

Run migration or paste in SQL Editor:

```
supabase/migrations/20260601120000_rides_one_open_per_buyer.sql
```

This blocks two active rides for the same buyer (like Uber / DiDi).

### Step 4 — Phones

1. Bookmark **one** Vercel preview URL (same every test).
2. **Both phones:** logout at `/unete` → login again with test numbers.
3. Driver: `/conductor/viajes` · Rider: `/viaje`

### Step 5 — Automated checks (local)

```bash
npm run test:rides-staging
npm run test:rides-full
```

Both must pass before the Mexico driver session.

---

## Ongoing (automatic)

- **Daily cron** (preview): `/api/cron/rides-stale-cleanup` cancels active rides older than 24h when `RIDES_ENABLED=true` (skipped on production unless `RIDES_STALE_CLEANUP=true`).
- **New ride request:** API rejects if buyer already has an open trip (`active_ride_exists`).
- **OTP login:** always resolves to existing user when phone matches any variant.

---

## If something breaks mid-test

| Symptom | Script |
|---------|--------|
| Driver blocked / panel empty | `rides-clear-stuck-driver-rides.sql` |
| Rider stuck on old trip | `rides-cancel-stale-rider-test.sql` |
| Wrong driver on ticket | `rides-fix-ride-driver-assignment.sql` |
| Full reset | `rides-phase0-preview-setup.sql` again |

After any SQL fix: **logout/login both phones**.

---

## Pass criteria

- `duplicate_users` = 1 for test phone
- `open_rides` = 0 before new test
- Full trip request → complete with **zero SQL during the trip**
- Same `ticket_code` on rider and driver

See also: [RIDES_UBER_PARITY.md](./RIDES_UBER_PARITY.md), [RIDES_STAGING.md](./RIDES_STAGING.md).
