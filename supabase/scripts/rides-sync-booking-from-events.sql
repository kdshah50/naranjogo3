-- Sync ride_bookings.status from ride_events when accept event exists but row stuck on matched.
-- Use after rides-diagnose-ticket.sql confirms has_driver_accepted = true on the open row.
-- Replace ticket below, review SELECTs, then run UPDATE.

BEGIN;

-- Preview rows to fix
SELECT rb.id, rb.ticket_code, rb.status, rb.updated_at
FROM public.ride_bookings rb
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
  AND rb.status = 'matched'
  AND EXISTS (
    SELECT 1 FROM public.ride_events re
    WHERE re.ride_id = rb.id AND re.event_type = 'driver_accepted'
  );

-- Promote matched → accepted when event log proves accept
UPDATE public.ride_bookings rb
SET status = 'accepted', updated_at = now()
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
  AND rb.status = 'matched'
  AND EXISTS (
    SELECT 1 FROM public.ride_events re
    WHERE re.ride_id = rb.id AND re.event_type = 'driver_accepted'
  );

-- Cancel duplicate open ghosts on same ticket (keep the accepted row)
UPDATE public.ride_bookings stale
SET status = 'cancelled', cancel_reason = 'duplicate_ticket_row', updated_at = now()
FROM public.ride_bookings keeper
WHERE stale.ticket_code ILIKE 'NG-82D379EE'
  AND keeper.ticket_code ILIKE 'NG-82D379EE'
  AND stale.id <> keeper.id
  AND keeper.status = 'accepted'
  AND stale.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

SELECT id, ticket_code, status, cancel_reason, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE 'NG-82D379EE'
ORDER BY updated_at DESC;

COMMIT;
