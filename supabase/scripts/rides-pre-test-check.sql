-- =============================================================================
-- PRE-TEST CHECK — run in Supabase SQL Editor before a new ride E2E test
-- =============================================================================
-- PASS when section 1 shows open_rides = 0 (and open_for_driver = 0 if you use
-- one MX driver phone). Section 2 confirms last trip completed/cancelled, not stuck.
-- If open > 0, run rides-cancel-stale-active-test-rides.sql then re-run this file.
-- =============================================================================

-- §1 — COUNTS (main gate: open_rides must be 0)
SELECT 'open_rides_all' AS check_name, count(*)::int AS n
FROM public.ride_bookings
WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

SELECT 'open_rides_test_phones' AS check_name, count(*)::int AS n
FROM public.ride_bookings rb
WHERE rb.status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND (
    rb.buyer_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
    OR rb.driver_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
  );

-- Canonical driver after one-driver cleanup (edit if your KEEP user differs)
SELECT 'open_rides_canonical_driver' AS check_name, count(*)::int AS n
FROM public.ride_bookings
WHERE driver_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip', 'requested');

-- §2 — LAST 10 rides (any status) for test phones — verify latest is completed/cancelled
SELECT
  rb.id,
  rb.ticket_code,
  rb.status,
  rb.estimated_total_mxn_cents,
  rb.final_total_mxn_cents,
  rb.driver_id,
  u_buyer.phone AS buyer_phone,
  rb.updated_at
FROM public.ride_bookings rb
LEFT JOIN public.users u_buyer ON u_buyer.id = rb.buyer_id
WHERE rb.buyer_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
   OR rb.driver_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
ORDER BY rb.updated_at DESC
LIMIT 10;

-- §3 — Specific ticket (e.g. NG-D97FC9EB) — should be completed, not matched
SELECT id, ticket_code, status, final_total_mxn_cents, updated_at, cancel_reason
FROM public.ride_bookings
WHERE ticket_code ILIKE '%D97FC9EB%'
   OR ticket_code = 'NG-D97FC9EB'
ORDER BY updated_at DESC;

-- §4 — Driver ready (optional)
SELECT user_id, is_active_driver, is_online, vehicle_plates, updated_at
FROM public.driver_profiles
WHERE user_id IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893',
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
  '7003532b-1bba-4bbe-8b7e-b89e86051169'
)
ORDER BY updated_at DESC;

-- §5 — Wallet holds (optional: held should be 0 before new request)
SELECT w.user_id, w.balance_mxn_cents, w.held_mxn_cents, u.phone
FROM public.wallets w
JOIN public.users u ON u.id::text = w.user_id
WHERE u.phone LIKE '%4151816902%'
   OR u.phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY w.held_mxn_cents DESC;

-- Expected before new test:
--   open_rides_all = 0
--   open_rides_test_phones = 0
--   Latest row in §2: status = completed (or cancelled)
--   §3 NG-D97FC9EB: status = completed
