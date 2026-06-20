-- Rides module foundation: prepaid MXN wallet (Phase 0).
-- Buyers load saldo via Stripe OXXO; spend via in-app rides / future services.
-- Append-only ledger is the source of truth; wallets.balance is derived.
--
-- ADDITIVE ONLY — no existing table is modified.
-- RLS enabled; access only through server code using SUPABASE_SERVICE_ROLE_KEY.
--
-- See: docs/RIDES_AI_PLAN.md §6 (Database changes), §9 (Wallet + OXXO).

-- ── wallets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id           TEXT PRIMARY KEY,
  balance_mxn_cents INT NOT NULL DEFAULT 0 CHECK (balance_mxn_cents >= 0),
  held_mxn_cents    INT NOT NULL DEFAULT 0 CHECK (held_mxn_cents >= 0),
  version           BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.wallets IS
  'Per-user prepaid MXN wallet (centavos). Balance and held are derived from wallet_ledger; this table caches them for fast reads.';
COMMENT ON COLUMN public.wallets.balance_mxn_cents IS
  'Available (spendable) balance in centavos. Must equal sum of ledger entries net of held.';
COMMENT ON COLUMN public.wallets.held_mxn_cents IS
  'Currently held for in-flight rides (not yet captured or released). Centavos.';
COMMENT ON COLUMN public.wallets.version IS
  'Optimistic locking version; bumped on every change to detect concurrent writes.';

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- ── wallet_ledger ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'load', 'load_bonus', 'hold', 'release',
                     'capture', 'refund', 'payout_debit', 'adjustment'
                   )),
  amount_mxn_cents INT NOT NULL,
  ride_booking_id  UUID NULL,
  stripe_pi_id     TEXT NULL,
  oxxo_voucher_id  TEXT NULL,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user
  ON public.wallet_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ride
  ON public.wallet_ledger (ride_booking_id)
  WHERE ride_booking_id IS NOT NULL;

-- Idempotency: a single Stripe load PaymentIntent must only credit once,
-- even if the webhook fires multiple times.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_load_pi
  ON public.wallet_ledger (stripe_pi_id)
  WHERE stripe_pi_id IS NOT NULL AND kind = 'load';

COMMENT ON TABLE public.wallet_ledger IS
  'Append-only ledger of every wallet movement. Source of truth for balances; never UPDATE or DELETE rows.';
COMMENT ON COLUMN public.wallet_ledger.kind IS
  'load=OXXO/card top-up; load_bonus=promo credit; hold=reserve for ride; release=cancel hold; capture=settle ride fare; refund=reverse capture; payout_debit=driver payout; adjustment=manual admin.';
COMMENT ON COLUMN public.wallet_ledger.amount_mxn_cents IS
  'Positive = credit to user (load, release, refund). Negative = debit (hold, capture, payout). Centavos.';
COMMENT ON COLUMN public.wallet_ledger.ride_booking_id IS
  'Set for hold/release/capture/refund entries tied to a specific ride booking.';
COMMENT ON COLUMN public.wallet_ledger.stripe_pi_id IS
  'Stripe PaymentIntent id for load entries. Used for webhook idempotency (unique with kind=load).';
COMMENT ON COLUMN public.wallet_ledger.oxxo_voucher_id IS
  'Stripe OXXO voucher reference for OXXO top-ups (cosmetic — pi_id is the canonical identifier).';

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
