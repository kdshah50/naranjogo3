-- Why "No hay conductores" while driver app shows online?
-- Run in Supabase SQL Editor. Read each section.

-- 1) Driver profile (must be active; online helps)
SELECT user_id, is_active_driver, is_online, service_colonias, last_lat, last_lng, updated_at
FROM public.driver_profiles
ORDER BY updated_at DESC;

-- 2) Ride listings for Carme accounts (any duplicate phone user)
SELECT l.id, l.seller_id, l.title_es, l.status, l.is_verified, l.subcategory_kind
FROM public.listings l
WHERE l.seller_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
ORDER BY l.created_at DESC;

-- 3) Driver stuck on an open ride? (blocks new matches)
SELECT id, status, driver_id, buyer_id, pickup_address, created_at
FROM public.ride_bookings
WHERE driver_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'
)
AND status IN ('requested','matched','accepted','arrived','in_trip')
ORDER BY created_at DESC;

-- 4) ONE-SHOT FIX (adjust if needed)
UPDATE public.listings
SET seller_id = '3d5522b3-aedf-4625-80a1-8a79708bb893',
    subcategory_kind = 'ride',
    is_verified = true,
    status = 'active'
WHERE id = 'b805f14c-2f3b-497f-bcf6-0748d84670bc';

UPDATE public.driver_profiles
SET is_active_driver = true,
    is_online = true,
    service_colonias = ARRAY['centro','guadalupe','olimpo','san_antonio','aurora']::text[]
WHERE user_id = '3d5522b3-aedf-4625-80a1-8a79708bb893';

UPDATE public.ride_bookings
SET status = 'cancelled', cancel_reason = 'test_clear_busy'
WHERE driver_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND status IN ('requested','matched','accepted','arrived','in_trip');
