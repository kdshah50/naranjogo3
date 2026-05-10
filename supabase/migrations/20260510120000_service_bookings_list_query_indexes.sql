-- Speed and stability for /api/bookings list paths at modest scale (many providers/buyers).
-- Partial indexes match the paid-only filters used in app queries.

CREATE INDEX IF NOT EXISTS idx_service_bookings_seller_paid_paid_at
  ON public.service_bookings (seller_id, paid_at DESC NULLS LAST)
  WHERE payment_status = 'paid';

CREATE INDEX IF NOT EXISTS idx_service_bookings_buyer_paid_paid_at
  ON public.service_bookings (buyer_id, paid_at DESC NULLS LAST)
  WHERE payment_status = 'paid';

CREATE INDEX IF NOT EXISTS idx_service_bookings_listing_paid_paid_at
  ON public.service_bookings (listing_id, paid_at DESC NULLS LAST)
  WHERE payment_status = 'paid';

CREATE INDEX IF NOT EXISTS idx_service_bookings_seller_paid_open_lifecycle
  ON public.service_bookings (seller_id, status, paid_at DESC NULLS LAST)
  WHERE payment_status = 'paid'
    AND status IN ('pending', 'confirmed', 'scheduled', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_service_bookings_listing_paid_open_lifecycle
  ON public.service_bookings (listing_id, status, paid_at DESC NULLS LAST)
  WHERE payment_status = 'paid'
    AND status IN ('pending', 'confirmed', 'scheduled', 'in_progress');

COMMENT ON INDEX idx_service_bookings_seller_paid_paid_at IS 'Seller paid booking list: order by settlement time.';
COMMENT ON INDEX idx_service_bookings_buyer_paid_paid_at IS 'Buyer paid booking list: order by settlement time.';
COMMENT ON INDEX idx_service_bookings_listing_paid_paid_at IS 'Paid rows by listing for merge branches.';
