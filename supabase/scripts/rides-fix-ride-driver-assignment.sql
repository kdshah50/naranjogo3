-- Fix a matched ride that WhatsApp shows but /conductor/viajes panel does not.
-- Run after requesting a trip (e.g. ticket NG-003C9589).

-- 1) Inspect the ride
SELECT id, status, ticket_code, driver_id, buyer_id, pickup_address, created_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%003C9589%'
   OR status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY created_at DESC
LIMIT 10;

-- 2) Point driver_id at canonical Carme account (same as rides-restore-driver-profile.sql)
UPDATE public.ride_bookings
SET driver_id = '3d5522b3-aedf-4625-80a1-8a79708bb893',
    updated_at = now()
WHERE ticket_code ILIKE '%003C9589%'
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip');

-- 3) Verify panel query pool would include it
SELECT id, status, ticket_code, driver_id
FROM public.ride_bookings
WHERE driver_id::text IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY created_at DESC;
