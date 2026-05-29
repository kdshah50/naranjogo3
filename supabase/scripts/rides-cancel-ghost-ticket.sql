-- Cancel open ghost rows when the same ticket already has a completed ride.
-- Run in Supabase SQL Editor (preview). Replace ticket if needed.

-- 1) Inspect
SELECT id, ticket_code, status, driver_id, buyer_id, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%D835CA2C%'
ORDER BY updated_at DESC;

-- 2) Cancel any still-open duplicate for that ticket
UPDATE public.ride_bookings
SET
  status = 'cancelled',
  cancel_reason = 'ghost_duplicate_completed_ticket',
  updated_at = now()
WHERE ticket_code ILIKE '%D835CA2C%'
  AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND EXISTS (
    SELECT 1
    FROM public.ride_bookings done
    WHERE done.ticket_code ILIKE '%D835CA2C%'
      AND done.status = 'completed'
      AND done.id <> ride_bookings.id
  );

-- 3) Verify
SELECT id, ticket_code, status, cancel_reason, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%D835CA2C%'
ORDER BY updated_at DESC;
