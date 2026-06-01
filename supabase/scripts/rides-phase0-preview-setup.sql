-- =============================================================================
-- PHASE 0 — Preview setup before Mexico driver test (run in Supabase SQL Editor)
-- =============================================================================
-- Order:
--   1) This file (stale cleanup + verify)
--   2) If duplicate_users > 1 → rides-one-driver-cleanup.sql (full merge)
--   3) Apply migration 20260601120000_rides_one_open_per_buyer.sql (if not applied)
--   4) Both phones: logout /unete → login again
--   5) npm run test:rides-staging && npm run test:rides-full
-- =============================================================================

-- §1 — BEFORE: duplicate users for test phone?
SELECT 'duplicate_users' AS check_name, count(*)::int AS n
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902');

SELECT 'users' AS section, id, phone, display_name, created_at
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY created_at;

-- §2 — Open rides before cleanup
SELECT 'open_rides_before' AS check_name, count(*)::int AS n
FROM public.ride_bookings
WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

BEGIN;

-- §3 — Cancel active rides older than 24h (preview hygiene)
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'phase0_stale_24h',
    updated_at = now()
WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND updated_at < now() - interval '24 hours';

-- §4 — Cancel ALL open rides for test phone (clean slate for new E2E)
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'phase0_test_reset',
    updated_at = now()
WHERE status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip')
  AND (
    buyer_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
    OR driver_id IN (
      SELECT id FROM public.users
      WHERE phone LIKE '%4151816902%'
         OR phone IN ('524151816902', '+524151816902', '5214151816902')
    )
  );

-- §5 — Release wallet holds for rides we just cancelled
INSERT INTO public.wallet_ledger (user_id, kind, amount_mxn_cents, ride_booking_id, meta)
SELECT wl.user_id,
       'release',
       wl.amount_mxn_cents,
       wl.ride_booking_id,
       '{"reason":"phase0_test_reset"}'::jsonb
FROM public.wallet_ledger wl
JOIN public.ride_bookings rb ON rb.id = wl.ride_booking_id
WHERE rb.cancel_reason IN ('phase0_stale_24h', 'phase0_test_reset')
  AND wl.kind = 'hold'
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallet_ledger rel
    WHERE rel.ride_booking_id = wl.ride_booking_id
      AND rel.kind = 'release'
  );

COMMIT;

-- §6 — AFTER: must be 0 open rides for test phones
SELECT 'open_rides_after' AS check_name, count(*)::int AS n
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

-- §7 — If duplicate_users > 1, run next:
--   supabase/scripts/rides-one-driver-cleanup.sql
--
-- §8 — Driver profile check (canonical)
SELECT user_id, is_active_driver, is_online, vehicle_plates
FROM public.driver_profiles
WHERE user_id = '3d5522b3-aedf-4625-80a1-8a79708bb893';

-- PASS when:
--   open_rides_after = 0
--   open_rides_test_phones = 0
--   duplicate_users = 1 (after one-driver-cleanup if needed)
