-- Tailoring MVP (Phase T1) — service menu on listings.
--
-- Additive, nullable column. Existing service flow (single price + agreed-subtotal
-- override) continues to work for sellers who don't fill a menu. When a menu is
-- present, the UI shows it publicly on the listing and the seller can build a
-- structured quote inside chat that lands in `listing_service_contact_gate.agreed_subtotal_mxn_cents`.
--
-- Shape (validated client-side and at the API layer in `lib/listing-service-menu.ts`):
-- {
--   "version": 1,
--   "items": [
--     { "sku": "hem_basic", "name_es": "Dobladillo pantalón", "name_en": "Pants hem", "price_mxn_cents": 5000 },
--     ...
--   ],
--   "currency": "MXN",
--   "disclaimer_es": "El precio puede ajustarse al revisar la prenda físicamente.",
--   "disclaimer_en": "Price may change after physical inspection of the garment."
-- }
--
-- All monetary values stored in centavos (consistent with `price_mxn` semantics
-- in the existing code that treats `price_mxn` as centavos).

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS service_menu JSONB;

COMMENT ON COLUMN public.listings.service_menu IS
  'Optional structured menu for service listings (e.g. tailoring): list of {sku,name_es,price_mxn_cents} rows. Centavos. Null when no menu published.';

-- Lightweight integrity guard: if present, must be an object with an items array.
-- Heavy validation lives in the application layer where we can return user-friendly errors.
ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_service_menu_shape_chk;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_service_menu_shape_chk
  CHECK (
    service_menu IS NULL
    OR (
      jsonb_typeof(service_menu) = 'object'
      AND jsonb_typeof(service_menu -> 'items') = 'array'
    )
  );
