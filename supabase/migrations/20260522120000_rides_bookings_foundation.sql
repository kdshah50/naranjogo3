-- Rides Phase 3: ride bookings + event log.
-- ADDITIVE ONLY — new tables; wallet_ledger.ride_booking_id already exists from Phase 0.
--
-- See: docs/RIDES_AI_PLAN.md §6 (ride_bookings, ride_events).

CREATE TABLE IF NOT EXISTS public.ride_bookings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                 UUID NOT NULL REFERENCES public.users(id),
  driver_id                UUID NULL REFERENCES public.users(id),
  listing_id               UUID NULL REFERENCES public.listings(id),
  status                   TEXT NOT NULL DEFAULT 'requested'
                           CHECK (status IN (
                             'requested','matched','accepted','arrived',
                             'in_trip','completed','cancelled','disputed'
                           )),
  pickup_lat               DOUBLE PRECISION NOT NULL,
  pickup_lng               DOUBLE PRECISION NOT NULL,
  pickup_address           TEXT NOT NULL,
  dropoff_lat              DOUBLE PRECISION NOT NULL,
  dropoff_lng              DOUBLE PRECISION NOT NULL,
  dropoff_address          TEXT NOT NULL,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at               TIMESTAMPTZ NULL,
  trip_started_at          TIMESTAMPTZ NULL,
  trip_ended_at            TIMESTAMPTZ NULL,
  passengers               INT NOT NULL DEFAULT 1 CHECK (passengers >= 1 AND passengers <= 8),
  luggage                  TEXT NULL,
  language                 TEXT NULL,
  estimated_total_mxn_cents  BIGINT NOT NULL CHECK (estimated_total_mxn_cents >= 0),
  hold_amount_mxn_cents    BIGINT NOT NULL CHECK (hold_amount_mxn_cents >= 0),
  final_total_mxn_cents    BIGINT NULL,
  commission_mxn_cents     BIGINT NULL,
  tip_mxn_cents            BIGINT NULL DEFAULT 0,
  distance_m               INT NULL,
  duration_s               INT NULL,
  cancel_reason            TEXT NULL,
  ticket_code              TEXT NULL UNIQUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_bookings_buyer_idx
  ON public.ride_bookings (buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_bookings_driver_idx
  ON public.ride_bookings (driver_id, created_at DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ride_bookings_status_idx
  ON public.ride_bookings (status, created_at DESC);

COMMENT ON TABLE public.ride_bookings IS
  'Taxi/ride bookings — separate lifecycle from service_bookings. Access via service role only (Phase 3).';

CREATE TABLE IF NOT EXISTS public.ride_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       UUID NOT NULL REFERENCES public.ride_bookings(id) ON DELETE CASCADE,
  actor_id      UUID NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT NULL,
  to_status     TEXT NULL,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_events_ride_idx
  ON public.ride_events (ride_id, created_at DESC);

COMMENT ON TABLE public.ride_events IS
  'Append-only audit log for ride lifecycle transitions and notifications.';

ALTER TABLE public.ride_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_events ENABLE ROW LEVEL SECURITY;
