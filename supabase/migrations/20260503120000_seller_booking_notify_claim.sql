-- Separate in-flight claim from delivered notification (avoids stuck rows if the process dies after claim).
-- After ~3 minutes a stale claim can be retried; seller_booking_paid_notified_at is set only after Twilio succeeds.

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS seller_booking_paid_notify_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_bookings.seller_booking_paid_notify_claimed_at IS
  'Set while provider notify is in progress; cleared on success or failure. Stale claims allow retry.';

NOTIFY pgrst, 'reload schema';
