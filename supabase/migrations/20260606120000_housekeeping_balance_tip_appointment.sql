-- Phase H5: balance after complete, tips, visit appointment (housekeeping end-to-end).

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_due_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS balance_payment_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS tip_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tip_payment_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS tip_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tip_stripe_checkout_session_id TEXT;

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_balance_payment_status_chk;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_balance_payment_status_chk
  CHECK (balance_payment_status IN ('none', 'pending', 'paid', 'waived'));

ALTER TABLE public.service_bookings
  DROP CONSTRAINT IF EXISTS service_bookings_tip_payment_status_chk;

ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_tip_payment_status_chk
  CHECK (tip_payment_status IN ('none', 'pending', 'paid'));

COMMENT ON COLUMN public.service_bookings.appointment_at IS 'Agreed visit date/time set when provider marks scheduled.';
COMMENT ON COLUMN public.service_bookings.balance_due_mxn_cents IS 'Job balance after deposit (pricing_base - commission), centavos.';
COMMENT ON COLUMN public.service_bookings.balance_payment_status IS 'none | pending (awaiting pay) | paid | waived.';
COMMENT ON COLUMN public.service_bookings.tip_mxn_cents IS 'Optional tip amount paid after service, centavos.';
