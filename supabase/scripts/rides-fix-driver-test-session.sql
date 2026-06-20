-- =============================================================================
-- ONE-SHOT FIX: driver panel + dispatch (preview testing)
-- Run entire script in Supabase SQL Editor BEFORE next ride test.
-- =============================================================================
-- Canonical Carme driver account:
--   user_id = 3d5522b3-aedf-4625-80a1-8a79708bb893
--   phone   = 524151816902
--   listing = b805f14c-2f3b-497f-bcf6-0748d84670bc
-- =============================================================================

BEGIN;

-- Phase 4 columns (Conectar needs is_online)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

-- 1) Cancel ALL stuck rides for this driver (unblocks dispatch + panel mismatch)
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'test_reset_session',
    updated_at = now()
WHERE driver_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip', 'requested');

-- 2) COPY profile to canonical user FIRST (do not delete before upsert)
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

-- Now safe to remove duplicate-user profile rows
DELETE FROM public.driver_profiles
WHERE user_id::text IN (
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
);

-- 3) Ride listing on same user_id as driver_profiles
UPDATE public.listings
SET seller_id = '3d5522b3-aedf-4625-80a1-8a79708bb893',
    subcategory_kind = 'ride',
    is_verified = true,
    status = 'active'
WHERE id = 'b805f14c-2f3b-497f-bcf6-0748d84670bc';

-- 4) Verify
SELECT 'driver_profiles' AS check_name, count(*)::int AS n
FROM public.driver_profiles
WHERE user_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND is_active_driver = true;

SELECT 'ride_listings' AS check_name, count(*)::int AS n
FROM public.listings
WHERE seller_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND subcategory_kind = 'ride'
  AND is_verified = true;

SELECT 'open_rides' AS check_name, count(*)::int AS n
FROM public.ride_bookings
WHERE driver_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip', 'requested');

COMMIT;

-- If driver_profiles count = 0 after this script, run rides-restore-driver-profile.sql
-- or re-register at /conductor on the app.
