-- Phase C: structured cancellation metadata + seller strike audit (guarantee no-show).
-- No automatic Stripe refunds; ranking already penalizes cancelled/paid ratio via get_listing_rank_multipliers.

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_role TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS cancel_note TEXT;

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_cancelled_by_role_check;
ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_cancelled_by_role_check
  CHECK (cancelled_by_role IS NULL OR cancelled_by_role IN ('buyer', 'seller'));

COMMENT ON COLUMN public.service_bookings.cancelled_at IS 'When status became cancelled (server time).';
COMMENT ON COLUMN public.service_bookings.cancelled_by_role IS 'Which party initiated cancellation.';
COMMENT ON COLUMN public.service_bookings.cancel_reason_code IS 'Machine-readable reason; validated in API.';
COMMENT ON COLUMN public.service_bookings.cancel_note IS 'Optional short note from cancelling party.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS provider_strike_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.provider_strike_count IS 'Increments when admin approves/refunds a guarantee claim for provider no-show (dispute signal).';

CREATE TABLE IF NOT EXISTS public.seller_strike_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id TEXT NOT NULL,
  booking_id UUID REFERENCES public.service_bookings (id) ON DELETE SET NULL,
  strike_type TEXT NOT NULL CHECK (strike_type IN ('guarantee_no_show_approved')),
  source_claim_id UUID REFERENCES public.guarantee_claims (id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_strike_events_source_claim
  ON public.seller_strike_events (source_claim_id)
  WHERE source_claim_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_strike_events_booking_guarantee
  ON public.seller_strike_events (booking_id)
  WHERE strike_type = 'guarantee_no_show_approved' AND booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_strike_events_seller ON public.seller_strike_events (seller_id);

COMMENT ON TABLE public.seller_strike_events IS 'Audit trail for provider penalties tied to bookings/guarantee outcomes.';
