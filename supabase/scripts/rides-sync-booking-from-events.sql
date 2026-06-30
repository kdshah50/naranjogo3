-- Force ride_bookings.status to match ride_events (fixes rider /viaje stuck on Matched).
-- Replace NG-82D379EE with your ticket. Run in Supabase SQL Editor.

BEGIN;

-- 1) What the DB says vs what events prove
SELECT
  rb.id,
  rb.ticket_code,
  rb.status AS booking_status_wrong_if_lower,
  CASE MAX(
    CASE re.event_type
      WHEN 'trip_completed' THEN 60
      WHEN 'trip_started' THEN 50
      WHEN 'driver_arrived' THEN 40
      WHEN 'driver_accepted' THEN 30
      WHEN 'driver_matched' THEN 20
      WHEN 'ride_requested' THEN 10
      ELSE 0
    END
  )
    WHEN 60 THEN 'completed'
    WHEN 50 THEN 'in_trip'
    WHEN 40 THEN 'arrived'
    WHEN 30 THEN 'accepted'
    WHEN 20 THEN 'matched'
    WHEN 10 THEN 'requested'
    ELSE rb.status
  END AS correct_status_from_events
FROM public.ride_bookings rb
LEFT JOIN public.ride_events re ON re.ride_id = rb.id
WHERE rb.ticket_code ILIKE 'NG-82D379EE'
GROUP BY rb.id, rb.ticket_code, rb.status
ORDER BY correct_status_from_events DESC;

-- 2) Promote each row to event-log truth (open trips only)
UPDATE public.ride_bookings rb
SET status = truth.correct_status, updated_at = now()
FROM (
  SELECT
    rb2.id,
    CASE MAX(
      CASE re.event_type
        WHEN 'trip_completed' THEN 60
        WHEN 'trip_started' THEN 50
        WHEN 'driver_arrived' THEN 40
        WHEN 'driver_accepted' THEN 30
        WHEN 'driver_matched' THEN 20
        WHEN 'ride_requested' THEN 10
        ELSE 0
      END
    )
      WHEN 60 THEN 'completed'
      WHEN 50 THEN 'in_trip'
      WHEN 40 THEN 'arrived'
      WHEN 30 THEN 'accepted'
      WHEN 20 THEN 'matched'
      WHEN 10 THEN 'requested'
    END AS correct_status
  FROM public.ride_bookings rb2
  JOIN public.ride_events re ON re.ride_id = rb2.id
  WHERE rb2.ticket_code ILIKE 'NG-82D379EE'
    AND rb2.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  GROUP BY rb2.id
) truth
WHERE rb.id = truth.id
  AND truth.correct_status IS NOT NULL
  AND rb.status IS DISTINCT FROM truth.correct_status;

-- 3) Cancel duplicate open rows (keep highest-status row)
WITH ranked AS (
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE status
          WHEN 'in_trip' THEN 50
          WHEN 'arrived' THEN 40
          WHEN 'accepted' THEN 30
          WHEN 'matched' THEN 20
          WHEN 'requested' THEN 10
          ELSE 0
        END DESC,
        updated_at DESC
    ) AS rn
  FROM public.ride_bookings
  WHERE ticket_code ILIKE 'NG-82D379EE'
    AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
)
UPDATE public.ride_bookings stale
SET status = 'cancelled', cancel_reason = 'duplicate_ticket_row', updated_at = now()
FROM ranked keeper
WHERE stale.ticket_code ILIKE 'NG-82D379EE'
  AND stale.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND keeper.rn = 1
  AND stale.id <> keeper.id;

-- 4) Verify
SELECT id, ticket_code, status, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE 'NG-82D379EE'
ORDER BY updated_at DESC;

COMMIT;
