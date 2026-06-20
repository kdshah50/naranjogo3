-- Phase 0: at most one open ride per buyer (Uber / DiDi style).
-- Run after rides-phase0-preview-setup.sql.

CREATE UNIQUE INDEX IF NOT EXISTS ride_bookings_one_open_per_buyer_idx
  ON public.ride_bookings (buyer_id)
  WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

COMMENT ON INDEX public.ride_bookings_one_open_per_buyer_idx IS
  'Phase 0: prevents ghost duplicate active rides for the same buyer.';
