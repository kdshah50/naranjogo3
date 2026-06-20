-- Fix duplicate ride_bookings rows for one ticket (preview E2E).
-- Run in Supabase SQL Editor. Replace ticket code if needed.

BEGIN;

-- 1) Show all rows for ticket
SELECT id, status, ticket_code, driver_id, buyer_id, updated_at
FROM public.ride_bookings
WHERE UPPER(TRIM(ticket_code)) = UPPER(TRIM('NG-009315A6'))
ORDER BY updated_at DESC;

-- 2) Cancel duplicate OPEN rows — keep the row with highest lifecycle (accepted > matched)
WITH ranked AS (
  SELECT id,
         status,
         ROW_NUMBER() OVER (
           ORDER BY
             CASE status
               WHEN 'in_trip' THEN 5
               WHEN 'arrived' THEN 4
               WHEN 'accepted' THEN 3
               WHEN 'matched' THEN 2
               WHEN 'requested' THEN 1
               ELSE 0
             END DESC,
             updated_at DESC
         ) AS rn
  FROM public.ride_bookings
  WHERE UPPER(TRIM(ticket_code)) = UPPER(TRIM('NG-009315A6'))
    AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
)
UPDATE public.ride_bookings rb
SET status = 'cancelled',
    cancel_reason = 'duplicate_ticket_row',
    updated_at = now()
FROM ranked r
WHERE rb.id = r.id
  AND r.rn > 1;

COMMIT;

SELECT id, status, ticket_code, cancel_reason
FROM public.ride_bookings
WHERE UPPER(TRIM(ticket_code)) = UPPER(TRIM('NG-009315A6'))
ORDER BY updated_at DESC;
