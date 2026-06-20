-- Cancel one stuck ride by ticket (run in Supabase SQL Editor).
-- Change the ticket code below, then run the whole script.

BEGIN;

UPDATE public.ride_bookings
SET
  status = 'cancelled',
  cancel_reason = 'manual_ticket_cancel',
  updated_at = now()
WHERE ticket_code = 'NG-352A7ABA'
  AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

SELECT id, ticket_code, status, cancel_reason, updated_at
FROM public.ride_bookings
WHERE ticket_code = 'NG-352A7ABA';

COMMIT;
