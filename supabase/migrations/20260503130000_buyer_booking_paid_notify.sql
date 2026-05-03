-- Idempotency: buyer WhatsApp after paid booking (confirmación + garantía); webhook + verify-session deduped.

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS buyer_booking_paid_notified_at TIMESTAMPTZ;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS buyer_booking_paid_notify_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_bookings.buyer_booking_paid_notified_at IS
  'When buyer was sent post-payment confirmation (e.g. WhatsApp); null = not sent yet.';

COMMENT ON COLUMN public.service_bookings.buyer_booking_paid_notify_claimed_at IS
  'In-flight claim for buyer notify; stale claims allow retry after crash.';

NOTIFY pgrst, 'reload schema';
