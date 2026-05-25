-- Run once in Supabase SQL Editor if driver "Conectar" fails with is_online missing.
-- Same as: supabase/migrations/20260523120000_rides_phase4_driver_online.sql

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_online
  ON public.driver_profiles (is_online, is_active_driver)
  WHERE is_online = true AND is_active_driver = true;
