-- Agreed job total per buyer (set by seller) + optional full payment via Stripe Connect (mirrors cart IVA split).

ALTER TABLE public.listing_service_contact_gate
  ADD COLUMN IF NOT EXISTS agreed_subtotal_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS seller_set_agreed_price_at TIMESTAMPTZ;

COMMENT ON COLUMN public.listing_service_contact_gate.agreed_subtotal_mxn_cents IS
  'When set with seller_set_agreed_price_at, commission/checkout base uses this (centavos) instead of listing/package price.';
COMMENT ON COLUMN public.listing_service_contact_gate.seller_set_agreed_price_at IS
  'Server time when seller saved agreed_subtotal_mxn_cents for this buyer; required for buyer checkout to use agreed base.';

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS pricing_base_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS checkout_mode TEXT NOT NULL DEFAULT 'commission_only'
    CHECK (checkout_mode IN ('commission_only', 'full_connect')),
  ADD COLUMN IF NOT EXISTS subtotal_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS vat_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS total_charged_mxn_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_application_fee_mxn_cents INTEGER;

COMMENT ON COLUMN public.service_bookings.pricing_base_mxn_cents IS
  'Centavos used as service subtotal for commission (listing, package total, or seller-agreed).';
COMMENT ON COLUMN public.service_bookings.checkout_mode IS
  'commission_only: buyer pays platform fee only. full_connect: subtotal + commission + IVA; Connect transfer to seller.';
COMMENT ON COLUMN public.service_bookings.subtotal_mxn_cents IS 'Service subtotal (full_connect only), centavos.';
COMMENT ON COLUMN public.service_bookings.vat_mxn_cents IS 'IVA on subtotal+commission (full_connect), centavos.';
COMMENT ON COLUMN public.service_bookings.total_charged_mxn_cents IS 'Stripe Checkout amount_total (full_connect), centavos.';
COMMENT ON COLUMN public.service_bookings.stripe_application_fee_mxn_cents IS 'application_fee_amount = commission + IVA kept by platform (full_connect).';
