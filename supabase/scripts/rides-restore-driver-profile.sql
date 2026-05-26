-- EMERGENCY: Conectar does nothing after rides-fix-driver-test-session.sql
-- Run in Supabase SQL Editor if driver_profiles row was deleted.
--
-- Step 1 — See if ANY profile exists for Carme phone accounts:
SELECT user_id, is_active_driver, is_online, vehicle_make, updated_at
FROM public.driver_profiles
WHERE user_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
);

-- Step 2 — If Step 1 returns ZERO rows, you must re-register at /conductor on the app.
-- If Step 1 returns a row on a DUPLICATE user_id, run Step 3.

-- Step 3 — Copy profile onto canonical user_id (safe upsert), then remove dupes:
INSERT INTO public.driver_profiles (
  user_id,
  license_number,
  license_expiry,
  license_photo_url,
  vehicle_make,
  vehicle_model,
  vehicle_year,
  vehicle_color,
  vehicle_plates,
  vehicle_card_photo_url,
  insurance_provider,
  insurance_policy,
  insurance_expiry,
  insurance_photo_url,
  service_colonias,
  background_check_status,
  is_active_driver,
  is_online
)
SELECT
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  license_number,
  license_expiry,
  license_photo_url,
  vehicle_make,
  vehicle_model,
  vehicle_year,
  vehicle_color,
  vehicle_plates,
  vehicle_card_photo_url,
  insurance_provider,
  insurance_policy,
  insurance_expiry,
  insurance_photo_url,
  ARRAY['centro','guadalupe','olimpo']::text[],
  COALESCE(background_check_status, 'none'),
  true,
  false
FROM public.driver_profiles
WHERE user_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
ORDER BY updated_at DESC NULLS LAST
LIMIT 1
ON CONFLICT (user_id) DO UPDATE SET
  is_active_driver = true,
  is_online = false,
  service_colonias = EXCLUDED.service_colonias,
  updated_at = now();

DELETE FROM public.driver_profiles
WHERE user_id::text IN (
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
);

-- Step 4 — Phase 4 columns (required for Conectar). Safe if already applied.
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

-- Step 5 — Verify (expect 1 row, is_active_driver true)
SELECT user_id, is_active_driver, is_online, vehicle_make
FROM public.driver_profiles
WHERE user_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893';
