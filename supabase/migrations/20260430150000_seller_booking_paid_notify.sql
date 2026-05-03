-- Idempotency for notifying the provider when commission is paid (avoid duplicate WhatsApp on webhook replay).

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS seller_booking_paid_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_bookings.seller_booking_paid_notified_at IS
  'Set when provider was notified (e.g. WhatsApp) that commission was paid; null = not sent yet.';

NOTIFY pgrst, 'reload schema';
