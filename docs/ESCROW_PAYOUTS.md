# Escrow Payouts — Activation Guide

A running log + how-to for the parked escrow payout flow. The code is
already on `escrow-payouts` branch and behaves as a no-op until the
environment flag is flipped.

---

## What the feature does

Without escrow (today's `full_connect` mode):

```
Buyer pays → Stripe immediately splits:
                · Platform fee + IVA → platform Stripe balance
                · Subtotal           → seller's Connect account (instantly)
```

The seller has the money the moment the buyer's card clears. There is no
hold, no dispute window, and if the job never happens the platform has to
chase the seller for the money.

With escrow (`PAYOUTS_ESCROW_ENABLED=true`):

```
Buyer pays → Full charge lands in platform Stripe balance (held in custody).

Seller marks the booking "Completado" in the app  ──>  app fires
   stripe.transfers.create({amount: subtotal, destination: connect})

Result: seller now has the subtotal; platform keeps commission + IVA.
```

Cancellation before transfer = automatic full refund to the buyer. After
the transfer = the row is marked `refund_blocked` so admin can intervene
manually.

---

## Why it's parked

`stripe.accounts.create({ country: "MX", ... })` requires the platform's
Stripe entity itself to be a Mexican entity. While Naranjogo's platform
account stays US-based, no Connect account can be created for Mexican
tailors. The escrow flow is therefore only useful once the Mexican Stripe
application is approved.

---

## Activation checklist (when MX Stripe is live)

### 1. Run the migration

```sql
-- supabase/migrations/20260519180000_service_bookings_payout_escrow.sql
-- already in this branch; just run it once against your Supabase project.
```

It adds six nullable columns to `service_bookings` and one partial index.
Idempotent.

### 2. Add environment variables

In Vercel → Settings → Environment Variables (Production + Preview):

| Key                       | Value          | Notes |
|---------------------------|----------------|-------|
| `PAYOUTS_ESCROW_ENABLED`  | `true`         | Master switch. Until this flips, nothing changes. |
| `PAYOUTS_HOLD_HOURS`      | `0`            | Set higher (e.g. `48`) for a buyer-dispute window. `0` = release immediately on Completed. |
| `CRON_SECRET`             | (random token) | Required if you use `PAYOUTS_HOLD_HOURS > 0` so the cron endpoint can authenticate. |

Both `PAYOUTS_ESCROW_ENABLED` and `PAYOUTS_HOLD_HOURS` should match across
all three Vercel envs unless you want to test the flow on Preview only
(common pattern: enable on Preview first, leave Production off until the
first live test passes).

### 3. Wire the cron job (only if `PAYOUTS_HOLD_HOURS > 0`)

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/release-payouts", "schedule": "*/15 * * * *" }
  ]
}
```

Every 15 minutes Vercel calls `/api/cron/release-payouts`. The handler
walks every booking with `payout_status='pending'` AND
`payout_release_after <= now()` and calls `stripe.transfers.create(...)`
for each. Idempotent.

### 4. Smoke test on Preview

1. Sign up a test tailor (`/unete?service=arreglos_de_ropa`), approve them
   (`is_verified=true`) and complete their Stripe Connect onboarding
   (`/profile` → "Activar cobros en Stripe"). Confirm `users.stripe_connect_account_id` starts with `acct_` for that row.
2. As a test buyer (different number), open the listing → chat → tailor
   sets an agreed total (use the menu builder).
3. Buyer opens the booking → "Pagar servicio completo" → Stripe Checkout
   completes. Confirm `service_bookings` shows:
   - `payment_status='paid'`
   - `checkout_mode='full_connect'`
   - `payout_status='pending'`
   - `payout_amount_mxn_cents` = subtotal
4. Tailor marks the booking `Completado`. Confirm:
   - If `PAYOUTS_HOLD_HOURS=0`: row immediately shows
     `payout_status='transferred'` and `payout_transfer_id` is set.
   - If `PAYOUTS_HOLD_HOURS>0`: `payout_release_after` is set; after the
     interval (or by manually calling `/api/cron/release-payouts` with the
     bearer token) the row flips to `'transferred'`.
5. Confirm in the Stripe dashboard that the Transfer landed on the
   seller's Connect account.
6. Try a cancellation BEFORE marking Completed → confirm
   `payout_status='refunded'` and the buyer was refunded in Stripe.

---

## Files in this feature branch

| File | Purpose |
|---|---|
| `supabase/migrations/20260519180000_service_bookings_payout_escrow.sql` | Adds payout columns to `service_bookings`. |
| `lib/payouts-escrow.ts` | Flag helpers, `markPayoutEligibleOnCompletion`, `releasePayout`, `refundOnCancellation`, `loadBookingForPayout`. |
| `app/api/bookings/checkout/route.ts` | When `isEscrowEnabled()` is true, drops `transfer_data.destination` from the PaymentIntent, adds `on_behalf_of`, and persists `payout_status='pending'`. Falls through to existing behavior when flag is off. |
| `app/api/bookings/[id]/route.ts` | On `completed`: schedules or fires release. On `cancelled`: refunds the buyer if no transfer happened yet. All gated by the flag. |
| `app/api/cron/release-payouts/route.ts` | Cron handler that scans for bookings whose hold has elapsed and releases them. Bearer-token authenticated via `CRON_SECRET`. |
| `docs/ESCROW_PAYOUTS.md` | This file. |

---

## Rollback

Because every code path is behind `isEscrowEnabled()`, rollback is
**just removing the env var** — no DB changes, no redeploy, no code
revert. The next checkout reverts to the original instant-split
`full_connect` flow. Any payouts that already transferred are settled.
Pending bookings (`payout_status='pending'`) can be drained by:

- Manually calling `/api/cron/release-payouts` with the cron secret, OR
- Setting `PAYOUTS_HOLD_HOURS=0` and marking the bookings `completed`
  (which the seller does naturally as the work finishes).

If you need to fully strip the schema:

```sql
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_status;
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_transfer_id;
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_amount_mxn_cents;
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_completed_at;
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_release_after;
ALTER TABLE public.service_bookings DROP COLUMN IF EXISTS payout_error;
DROP INDEX IF EXISTS idx_service_bookings_payout_release_after;
```

Don't do this unless you're sure no production row has a non-NULL value
on any of those columns.

---

## Open follow-ups (deferred to a Phase E2)

- A small UI panel in `/seller-bookings` showing payout state per booking
  ("Pendiente de liberación", "Transferido el …", "Reembolsado", etc.).
- A buyer-facing "Pedir reembolso" button during the hold window — for
  now buyers contact support and admin manually flips the booking to
  cancelled, which triggers the refund automatically.
- Mexican CLABE field on the seller profile (Stripe Connect onboarding
  collects it, but mirroring it on `users` helps admin reconcile).
- An admin dashboard column for `payout_status='failed'` and
  `'refund_blocked'` rows so they don't get lost.
