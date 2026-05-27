-- Diagnose a ride ticket: status, cancel reason, recent events.
-- Replace the ticket code in the WHERE clause.

SELECT
  rb.id,
  rb.ticket_code,
  rb.status,
  rb.cancel_reason,
  rb.driver_id::text AS driver_id,
  rb.buyer_id::text AS buyer_id,
  rb.created_at,
  rb.updated_at,
  rb.matched_at,
  rb.trip_started_at,
  rb.trip_ended_at
FROM public.ride_bookings rb
WHERE rb.ticket_code = 'NG-352A7ABA'
ORDER BY rb.updated_at DESC;

SELECT
  re.created_at,
  re.event_type,
  re.from_status,
  re.to_status,
  re.actor_id::text AS actor_id,
  re.meta
FROM public.ride_events re
JOIN public.ride_bookings rb ON rb.id = re.ride_id
WHERE rb.ticket_code = 'NG-352A7ABA'
ORDER BY re.created_at DESC
LIMIT 20;
