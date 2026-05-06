-- Idempotent WhatsApp to buyer when seller marks booking completed (review prompt).
ALTER TABLE public.service_bookings
ADD COLUMN IF NOT EXISTS buyer_completed_review_notify_claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS buyer_completed_review_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_bookings.buyer_completed_review_notified_at IS
  'Set when buyer received WhatsApp with link to submit review after provider marked completed.';
