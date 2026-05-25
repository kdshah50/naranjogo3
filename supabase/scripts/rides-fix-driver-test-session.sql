-- =============================================================================
-- ONE-SHOT FIX: driver panel empty + dispatch blocked (preview testing)
-- Run entire script in Supabase SQL Editor BEFORE next ride test.
-- =============================================================================
-- Canonical Carme driver account:
--   user_id = 3d5522b3-aedf-4625-80a1-8a79708bb893
--   phone   = 524151816902
--   listing = b805f14c-2f3b-497f-bcf6-0748d84670bc
-- =============================================================================

BEGIN;

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

-- 2) Single driver profile on canonical user (delete dupes on other phone rows)
DELETE FROM public.driver_profiles
WHERE user_id::text IN (
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
);

UPDATE public.driver_profiles
SET is_active_driver = true,
    is_online = false,
    service_colonias = ARRAY['centro','guadalupe','olimpo']::text[],
    updated_at = now()
WHERE user_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893';

-- 3) Ride listing on same user_id as driver_profiles (dispatch + panel must match)
UPDATE public.listings
SET seller_id = '3d5522b3-aedf-4625-80a1-8a79708bb893',
    subcategory_kind = 'ride',
    is_verified = true,
    status = 'active'
WHERE id = 'b805f14c-2f3b-497f-bcf6-0748d84670bc';

-- 4) Verify — expect 1 active profile, 1 ride listing, 0 open rides
SELECT 'driver_profiles' AS check_name, count(*)::int AS n
FROM public.driver_profiles
WHERE is_active_driver = true;

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

-- AFTER SQL:
-- 1) Preview deploy with latest rides-setup branch
-- 2) Driver phone: log out /unete → log in 415 181 6902 → /conductor/viajes → Conectar
-- 3) Rider (different browser or account): ONE trip Centro → Guadalupe
-- 4) Driver panel should show latest ticket within ~3s
