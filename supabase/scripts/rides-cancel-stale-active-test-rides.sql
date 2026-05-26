-- Cancel stale active ride_bookings for test buyer phone (stuck in_trip blocks /viaje UI).
-- Run in Supabase SQL Editor after a completed test trip.

SELECT id, status, ticket_code, updated_at, pickup_address
FROM public.ride_bookings
WHERE status IN ('matched', 'accepted', 'arrived', 'in_trip')
  AND buyer_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
  )
ORDER BY updated_at DESC;

UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'stale_test_cleanup',
    updated_at = now()
WHERE status IN ('matched', 'accepted', 'arrived', 'in_trip')
  AND buyer_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
  );

SELECT id, status, ticket_code, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%003C9589%'
   OR updated_at > now() - interval '48 hours'
ORDER BY updated_at DESC
LIMIT 10;
