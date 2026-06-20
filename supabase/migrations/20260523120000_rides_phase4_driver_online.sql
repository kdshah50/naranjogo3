-- Rides Phase 4: driver online status + last GPS ping.
-- ADDITIVE ONLY — columns on driver_profiles.

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.driver_profiles.is_online IS
  'When true and is_active_driver, driver is eligible for dispatch (Phase 4).';
COMMENT ON COLUMN public.driver_profiles.last_lat IS
  'Last reported GPS latitude from POST /api/rides/drivers/me/online.';
COMMENT ON COLUMN public.driver_profiles.last_lng IS
  'Last reported GPS longitude from POST /api/rides/drivers/me/online.';
COMMENT ON COLUMN public.driver_profiles.last_location_at IS
  'Timestamp of last GPS ping.';

CREATE INDEX IF NOT EXISTS idx_driver_profiles_online
  ON public.driver_profiles (is_online, is_active_driver)
  WHERE is_online = true AND is_active_driver = true;
