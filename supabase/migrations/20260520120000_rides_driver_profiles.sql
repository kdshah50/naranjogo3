-- Rides Phase 1: driver onboarding (vehicle + license + insurance).
-- ADDITIVE ONLY — one nullable column on listings; new driver_profiles table.
--
-- See: docs/RIDES_AI_PLAN.md §6, §8 (Driver onboarding extension).

-- Ride driver listings are normal service listings with subcategory_kind = 'ride'.
-- NULL on existing rows → identical behaviour to today.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS subcategory_kind TEXT NULL;

COMMENT ON COLUMN public.listings.subcategory_kind IS
  'NULL = standard listing. ride = taxi/ride driver profile (only routed by rides code when RIDES_ENABLED).';

-- Driver profile (1:1 with users when user registers as a ride driver)
CREATE TABLE IF NOT EXISTS public.driver_profiles (
  user_id                  TEXT PRIMARY KEY,
  license_number           TEXT NOT NULL,
  license_expiry           DATE NOT NULL,
  license_photo_url        TEXT NOT NULL,
  vehicle_make             TEXT NOT NULL,
  vehicle_model            TEXT NOT NULL,
  vehicle_year             INT NOT NULL CHECK (vehicle_year >= 1985 AND vehicle_year <= 2100),
  vehicle_color            TEXT NOT NULL,
  vehicle_plates           TEXT NOT NULL,
  vehicle_card_photo_url   TEXT NOT NULL,
  insurance_provider       TEXT NOT NULL,
  insurance_policy         TEXT NOT NULL,
  insurance_expiry         DATE NOT NULL,
  insurance_photo_url      TEXT NOT NULL,
  service_colonias         TEXT[] NOT NULL DEFAULT '{}',
  background_check_status  TEXT NOT NULL DEFAULT 'none'
                           CHECK (background_check_status IN ('none','pending','passed','failed')),
  is_active_driver         BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_active
  ON public.driver_profiles (is_active_driver)
  WHERE is_active_driver = true;

COMMENT ON TABLE public.driver_profiles IS
  'Ride driver credentials and vehicle info. is_active_driver=false until admin approval.';
COMMENT ON COLUMN public.driver_profiles.is_active_driver IS
  'Admin gate — driver can receive ride assignments only when true (plus listing is_verified).';
COMMENT ON COLUMN public.driver_profiles.service_colonias IS
  'Colonia keys (from lib/colonias) where the driver accepts pickups.';

ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
