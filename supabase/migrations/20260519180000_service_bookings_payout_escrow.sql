-- Phase: Escrow Payouts (parked on branch — only relevant when PAYOUTS_ESCROW_ENABLED=true)
--
-- Adds columns to track the post-completion Stripe Transfer flow:
--   * In current `full_connect` mode, the buyer's payment immediately splits via
--     `transfer_data.destination` on the PaymentIntent — the seller gets paid the
--     moment the buyer's card clears. There is no hold.
--   * When PAYOUTS_ESCROW_ENABLED=true, the platform charges the full amount with
--     NO `transfer_data` (money stays in the platform Stripe balance), then a
--     separate `stripe.transfers.create(...)` fires when the seller marks the
--     booking `completed` (immediately if PAYOUTS_HOLD_HOURS=0, else after that
--     many hours via the cron `/api/cron/release-payouts`).
--
-- All columns are nullable. Existing rows = NULL = behavior unchanged.

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_status TEXT;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_transfer_id TEXT;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_amount_mxn_cents INT;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_completed_at TIMESTAMPTZ;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_release_after TIMESTAMPTZ;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS payout_error TEXT;

-- Validation: payout_status must be one of the known states (or NULL).
ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_payout_status_chk;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_payout_status_chk
  CHECK (
    payout_status IS NULL
    OR payout_status IN (
      'pending',          -- buyer paid; awaiting completion + release
      'releasing',        -- release in progress (transient)
      'transferred',      -- Stripe Transfer succeeded; seller has the money
      'refunded',         -- booking cancelled, buyer refunded
      'refund_blocked',   -- can't auto-refund (transfer already happened); admin must handle
      'failed'            -- transfer failed; admin must investigate via payout_error
    )
  );

-- Cron worker picks up bookings ready for release.
CREATE INDEX IF NOT EXISTS idx_service_bookings_payout_release_after
  ON public.service_bookings (payout_release_after)
  WHERE payout_status = 'pending' AND payout_release_after IS NOT NULL;
