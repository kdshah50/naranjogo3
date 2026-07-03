-- Store colonia keys for redacted ride history (street addresses stay encrypted in pickup/dropoff_address).
ALTER TABLE public.ride_bookings
  ADD COLUMN IF NOT EXISTS pickup_colonia TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_colonia TEXT;

COMMENT ON COLUMN public.ride_bookings.pickup_colonia IS
  'Colonia/neighborhood key for list UI — no street-level PII in history views.';
COMMENT ON COLUMN public.ride_bookings.dropoff_colonia IS
  'Colonia/neighborhood key for list UI — no street-level PII in history views.';
