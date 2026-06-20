-- Cancel stale open ride_bookings for test rider (732 / uid 8ce0201b…).
-- Run in Supabase SQL Editor before a new E2E test when /viaje shows verify:completed.

-- 1) Inspect rider pool + recent rides
SELECT u.id, u.phone, u.created_at
FROM public.users u
WHERE u.id::text ILIKE '8ce0201b%'
   OR u.phone LIKE '%732%'
ORDER BY u.created_at;

SELECT rb.id, rb.ticket_code, rb.status, rb.buyer_id, rb.updated_at, rb.pickup_address
FROM public.ride_bookings rb
WHERE rb.buyer_id IN (
  SELECT u.id FROM public.users u
  WHERE u.id::text ILIKE '8ce0201b%'
     OR u.phone LIKE '%732%'
)
ORDER BY rb.updated_at DESC
LIMIT 15;

-- 2) Cancel open ghosts when same buyer already has a completed trip
UPDATE public.ride_bookings stale
SET status = 'cancelled',
    cancel_reason = 'stale_rider_test_cleanup',
    updated_at = now()
FROM public.ride_bookings done
WHERE stale.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND done.status = 'completed'
  AND stale.id <> done.id
  AND stale.buyer_id = done.buyer_id
  AND stale.buyer_id IN (
    SELECT u.id FROM public.users u
    WHERE u.id::text ILIKE '8ce0201b%'
       OR u.phone LIKE '%732%'
  );

-- 3) Cancel any remaining open rows for this rider pool
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'stale_rider_test_cleanup',
    updated_at = now()
WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND buyer_id IN (
    SELECT u.id FROM public.users u
    WHERE u.id::text ILIKE '8ce0201b%'
       OR u.phone LIKE '%732%'
  );

-- 4) Verify clean slate
SELECT count(*)::int AS open_rides_for_rider
FROM public.ride_bookings rb
WHERE rb.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND rb.buyer_id IN (
    SELECT u.id FROM public.users u
    WHERE u.id::text ILIKE '8ce0201b%'
       OR u.phone LIKE '%732%'
  );
