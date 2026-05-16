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
| Preview URL (testing ground) | `naranjogo3-git-rides-setup-...vercel.app` |
| Supabase project | Production (single project; new tables added are isolated/empty) |
| Feature flag (`RIDES_ENABLED`) | `false` in Production, `true` in Preview + Development |
| Current phase | **Phase 0 — Wallet + OXXO top-up** |
| Latest step completed | **Step 5 ✓ verified** (GET `/api/rides/wallet` returns balance) |
| Next step | Step 6 (Stripe Checkout Session for OXXO top-up) |

---

## How to resume after a break

If you come back days/weeks later and want to continue:

1. Open this file (`docs/RIDES_PROGRESS.md`) — you're reading it
2. Check "Where we are right now" above for current state
3. Make sure you're on the right branch:
   ```bash
   git branch --show-current        # should print: rides-setup
   ```
   If not, run:
   ```bash
   git checkout rides-setup && git pull
   ```
4. Tell the AI assistant: "Continue with rides project from Step N" (whatever step is "next" above)

---

## Useful commands cheat sheet

| Task | Command |
|---|---|
| Check current branch | `git branch --show-current` |
| Switch to rides branch | `git checkout rides-setup` |
| Switch back to main (safe / live code) | `git checkout main` |
| See latest commits on your branch | `git log --oneline -5` |
| See what files have unsaved changes | `git status --short` |
| Pull latest from GitHub | `git pull` |
| Push your commits to GitHub (triggers Vercel preview rebuild) | `git push` |

---

## Step-by-step log

### Step 1 — Created working branch and committed design plan

**Why:** Working on `main` would auto-deploy to production. We need a sandbox branch where everything is safe to test before going live.

**What changed:**
- New branch created: `rides-setup` (branched from `main`)
- New file added: [`docs/RIDES_AI_PLAN.md`](./RIDES_AI_PLAN.md) — the full design doc

**Commit:** `6d0bd75` — `docs(rides): add AI agents + rides module design plan`

**Verified:** Branch pushed to GitHub. Vercel built a preview URL for the branch. `main` unchanged.

---

### Step 2 — Added the master kill switch

**Why:** We need a single env var (`RIDES_ENABLED`) that turns all rides features on/off without code changes. Production stays off until we're explicitly ready.

#### Step 2A — Code helper

**What changed:**
- New file: [`lib/rides/flags.ts`](../lib/rides/flags.ts) — exports `isRidesEnabled()` function

**Commit:** `fddb258` — `feat(rides): add RIDES_ENABLED master kill switch helper`

#### Step 2B — Vercel environment variables

**What changed (in Vercel dashboard, not code):**
- `RIDES_ENABLED=false` for **Production** environment
- `RIDES_ENABLED=true` for **Preview** environment
- `RIDES_ENABLED=true` for **Development** environment

**Effect:** When code asks `isRidesEnabled()`:
- On `naranjogo.com.mx` → returns `false` → rides features off
- On preview URL → returns `true` → rides features on
- Running `npm run dev` locally → returns `true`

**Verified:** All three env vars listed in Vercel Settings → Environment Variables with correct spelling (`RIDES_ENABLED`, not `RIDES_ENABLE`).

---

### Step 3 — Created wallet database tables in Supabase

**Why:** Phase 0 (wallet + OXXO top-up) needs two new tables to store balances and transaction history.

**What changed:**
- New migration file: [`supabase/migrations/20260516143000_rides_wallet_foundation.sql`](../supabase/migrations/20260516143000_rides_wallet_foundation.sql)
- SQL run in Supabase Dashboard SQL Editor (production project)
- Two new tables created:
  - `wallets` — per-user balance + held amount (one row per user)
  - `wallet_ledger` — append-only history of every wallet event (load/spend/hold/release)

**Commit:** `bfeeb65` — `feat(rides): add wallets and wallet_ledger tables (Phase 0 foundation)`

**Important:** These tables are **brand new and additive**. They don't affect any existing tables (`users`, `listings`, `service_bookings`, etc.). Both start empty. Existing app behaviour is unchanged.

**Verified:** Both tables visible in Supabase → Table Editor with 0 rows.

---

### Step 4 — Wallet server library (TypeScript)

**Why:** Need typed helper functions to read and write the new tables. All API endpoints will use these helpers.

**What changed:**
- New file: [`lib/rides/wallet-server.ts`](../lib/rides/wallet-server.ts)
- Exports two functions:
  - `getWalletForUser(supabase, userId)` — read balance + recent ledger
  - `creditWallet(supabase, args)` — add money (load / bonus / refund / adjustment), with built-in idempotency to prevent double-credits from duplicate Stripe webhooks

**Commit:** `5e0a462` — `feat(rides): add wallet server library (read + credit)`

**Verified:** No linter errors. File compiled successfully on Vercel preview build.

---

### Step 5 — GET endpoint to read wallet balance

**Why:** First user-facing rides feature. Lets the frontend display "Saldo Naranjo: $X" by calling this endpoint.

**What changed:**
- New file: [`app/api/rides/wallet/route.ts`](../app/api/rides/wallet/route.ts)
- Behaviour:
  - Returns `404 Not found` if `RIDES_ENABLED=false` (production)
  - Returns `401 No autenticado` if user not logged in
  - Returns `200` with `{ wallet: { balance_mxn_cents, held_mxn_cents, recent_ledger } }` if logged in

**Commit:** `d4f5845` — `feat(rides): GET /api/rides/wallet endpoint (read balance)`

**Verification tests:**
- [x] Test (logged-in visit): saw `{"wallet":{"user_id":"...","balance_mxn_cents":0,"held_mxn_cents":0,"version":0,"recent_ledger":[]}}` ✓
- Endpoint correctly reads from the new wallet tables (returns zeroed wallet for a user with no transactions)
- Auth correctly gated the response
- Note: had to log in on the preview URL itself (preview is a different domain than production, so production login cookie doesn't carry over)

---

## What's coming next

### Step 6 — OXXO top-up flow

Lets users actually load money into their wallet. Will create:
- `lib/rides/wallet-oxxo.ts` — Stripe OXXO PaymentIntent creator
- `app/api/rides/wallet/topup/route.ts` — POST endpoint that creates a voucher
- Additive branch in `app/api/webhooks/stripe/route.ts` — credits wallet when Stripe confirms OXXO payment

### Step 7 — Simple UI page

A `/saldo` page in your app where users see their balance and click "Cargar saldo" to load money.

### Step 8 — Soft test end-to-end

In Stripe test mode, simulate an OXXO payment, verify wallet gets credited, view in the UI.

### After Phase 0

We pause, prove the wallet works on the preview URL, then merge to `main` (Production gets the code but `RIDES_ENABLED=false` keeps it dormant). After that we move into:
- Phase 1 — Driver onboarding
- Phase 2 — WhatsApp Cloud API integration
- Phase 3 — Booking Agent (LangGraph)
- ...see `docs/RIDES_AI_PLAN.md` §12 for the full phase list.

---

## Rollback plan (just in case)

If anything ever goes wrong:

1. **Undo a single commit on the rides-setup branch:**
   ```bash
   git revert HEAD              # creates a new commit that undoes the last one
   git push
   ```
2. **Throw away the entire rides-setup branch and start over:**
   ```bash
   git checkout main            # back to safe ground
   git branch -D rides-setup    # delete the local branch
   git push origin --delete rides-setup   # delete the remote branch (only if you really mean it)
   ```
3. **Drop the new tables in Supabase (last resort):**
   ```sql
   DROP TABLE IF EXISTS public.wallet_ledger;
   DROP TABLE IF EXISTS public.wallets;
   ```
   Run that in Supabase SQL Editor. Existing tables/data unaffected.

Production (`main` + `naranjogo.com.mx`) is **never at risk** from any of these — we only merge to `main` when we explicitly decide to, and even then `RIDES_ENABLED=false` keeps features off.

---

*Last updated: Step 5 verified ✓. Update this file after every step.*
