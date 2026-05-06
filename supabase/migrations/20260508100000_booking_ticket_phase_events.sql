-- Booking lifecycle: extended statuses, human-readable ticket_code, audit trail.

ALTER TABLE public.service_bookings
DROP CONSTRAINT IF EXISTS service_bookings_status_check;

ALTER TABLE public.service_bookings
ADD CONSTRAINT service_bookings_status_check
CHECK (
  status IN (
    'pending',
    'confirmed',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  )
);

ALTER TABLE public.service_bookings
ADD COLUMN IF NOT EXISTS ticket_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_bookings_ticket_code_unique
ON public.service_bookings (ticket_code)
WHERE ticket_code IS NOT NULL;

COMMENT ON COLUMN public.service_bookings.ticket_code IS 'Human-readable ticket shown to buyer/provider (e.g. NG-A1B2C3D4); set when payment succeeds.';

CREATE TABLE IF NOT EXISTS public.booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.service_bookings (id) ON DELETE CASCADE,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id ON public.booking_events (booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_events_created ON public.booking_events (created_at DESC);

COMMENT ON TABLE public.booking_events IS 'Audit log: booking status changes and buyer notifications for disputes/SLA.';
