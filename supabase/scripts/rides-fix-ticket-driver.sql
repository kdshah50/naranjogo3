-- Point one ride ticket at canonical driver (preview SQL Editor).
-- Use when debug says "DB has ride but panel API returned 0" for a known ticket.

-- §1 — Check ticket
SELECT id, ticket_code, status, driver_id::text, buyer_id::text, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%352A7ABA%'
   OR ticket_code = 'NG-352A7ABA'
ORDER BY created_at DESC;

-- §2 — Assign to canonical driver (edit ticket if needed)
UPDATE public.ride_bookings
SET driver_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
    updated_at = now()
WHERE ticket_code = 'NG-352A7ABA'
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip');

-- §3 — Verify panel would see it
SELECT id, ticket_code, status, driver_id::text
FROM public.ride_bookings
WHERE driver_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY updated_at DESC;
