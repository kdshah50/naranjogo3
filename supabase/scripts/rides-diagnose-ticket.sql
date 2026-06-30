-- Diagnose a ride ticket: rows, booking status vs event log, duplicates.
-- Replace NG-82D379EE with your ticket (use ILIKE — exact 8-char hex after NG-).

-- 1) All ride_bookings rows for this ticket
SELECT
  rb.id,
  rb.ticket_code,
  rb.status AS booking_status,
  rb.cancel_reason,
  rb.driver_id::text AS driver_id,
  rb.buyer_id::text AS buyer_id,
  rb.created_at,
  rb.updated_at,
  rb.matched_at
FROM public.ride_bookings rb
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
ORDER BY rb.updated_at DESC;

-- 2) Highest lifecycle step per row (from ride_events — what /viaje should show)
SELECT
  rb.id AS ride_id,
  rb.ticket_code,
  rb.status AS booking_status,
  MAX(
    CASE re.event_type
      WHEN 'trip_completed' THEN 60
      WHEN 'trip_started' THEN 50
      WHEN 'driver_arrived' THEN 40
      WHEN 'driver_accepted' THEN 30
      WHEN 'driver_matched' THEN 20
      WHEN 'ride_requested' THEN 10
      ELSE 0
    END
  ) AS event_status_code,
  bool_or(re.event_type = 'driver_accepted') AS has_driver_accepted
FROM public.ride_bookings rb
LEFT JOIN public.ride_events re ON re.ride_id = rb.id
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
GROUP BY rb.id, rb.ticket_code, rb.status
ORDER BY event_status_code DESC, rb.updated_at DESC;

-- 3) Full event log
SELECT
  re.created_at,
  re.ride_id::text,
  re.event_type,
  re.from_status,
  re.to_status
FROM public.ride_events re
JOIN public.ride_bookings rb ON rb.id = re.ride_id
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
ORDER BY re.created_at DESC
LIMIT 30;
