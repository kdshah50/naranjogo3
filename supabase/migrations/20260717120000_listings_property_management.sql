-- Property Management profile (monthly retainer packages + vetting metadata).
-- Spec: docs/Naranjogo_PropertyManagement_Spec.pdf

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS property_management jsonb;

COMMENT ON COLUMN public.listings.property_management IS
  'Property management vertical: sub_services, monthly package tiers, insurance/references vetting. NULL for non-PM listings.';

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_property_management_is_object;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_property_management_is_object
  CHECK (
    property_management IS NULL
    OR jsonb_typeof(property_management) = 'object'
  );
