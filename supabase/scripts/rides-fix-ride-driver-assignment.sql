-- Fix a matched ride that WhatsApp shows but /conductor/viajes panel does not.
-- Run after requesting a trip (replace ticket pattern or use latest matched).

-- 1) Inspect active rides
SELECT id, status, ticket_code, driver_id, buyer_id, pickup_address, created_at, updated_at
FROM public.ride_bookings
WHERE status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY created_at DESC
LIMIT 10;

-- 2) Point driver_id at canonical test driver (415 181 6902 / Carme)
--    Change the ticket filter to your current ride, e.g. NG-7126D4E0
UPDATE public.ride_bookings
SET driver_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
    updated_at = now()
WHERE status IN ('matched', 'accepted', 'arrived', 'in_trip')
  AND (
    ticket_code ILIKE '%7126D4E0%'
    OR id = (
      SELECT id FROM public.ride_bookings
      WHERE status = 'matched'
      ORDER BY created_at DESC
      LIMIT 1
    )
  );

-- 3) Verify panel pool would include it
SELECT id, status, ticket_code, driver_id, updated_at
FROM public.ride_bookings
WHERE driver_id IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
  '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
)
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY updated_at DESC;
