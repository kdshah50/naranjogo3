-- =============================================================================
-- RIDES — reset all driver + ride test data (Supabase SQL Editor)
-- =============================================================================
-- USE ON: Preview / staging only. Do NOT run on production naranjogo.com.mx
--         until you intentionally want to wipe rides data.
--
-- What this does:
--   • Deletes all ride_bookings (+ ride_events via CASCADE)
--   • Deletes wallet_ledger rows tied to those rides
--   • Deletes ALL driver_profiles
--   • Deletes ALL listings with subcategory_kind = 'ride'
--   • Deletes driver document files in storage bucket driver-docs
--   • Optionally removes duplicate users rows for one test phone (see §4)
--
-- What this does NOT do:
--   • Does not delete buyer wallets/saldo (wallets table stays)
--   • Does not delete non-ride listings or service_bookings
--
-- After running:
--   1. Tester: clear site cookies OR log out at /unete (tianguis_token)
--   2. One person registers fresh at /conductor with test phone
--   3. Admin approves in SQL (§5) or Supabase table editor
-- =============================================================================

BEGIN;

-- ── 1. Wallet ledger + ride bookings + events ─────────────────────────────────
DELETE FROM public.wallet_ledger
WHERE ride_booking_id IS NOT NULL;

DELETE FROM public.ride_events
WHERE ride_id IN (SELECT id FROM public.ride_bookings);

DELETE FROM public.ride_bookings;

-- ── 2. Driver profiles (all drivers) ──────────────────────────────────────────
UPDATE public.driver_profiles
SET is_online = false
WHERE is_online = true;

DELETE FROM public.driver_profiles;

-- ── 3. Ride driver listings ───────────────────────────────────────────────────
DELETE FROM public.listings
WHERE subcategory_kind = 'ride';

-- ── 4. Driver docs in Storage (optional but recommended for clean signup) ─────
DELETE FROM storage.objects
WHERE bucket_id = 'driver-docs';

-- ── 5. (Optional) Remove duplicate users for ONE test phone ───────────────────
-- Uncomment and set ids after you run the SELECT below.
-- Keep exactly ONE user row for the driver phone; delete the rest.
--
-- Preview which rows exist:
-- SELECT id, phone, display_name, created_at
-- FROM public.users
-- WHERE phone LIKE '%4151816902%'
--    OR phone IN ('524151816902', '+524151816902', '5214151816902')
-- ORDER BY created_at;
--
-- Example (adjust ids to your query result — keep ONE row):
-- DELETE FROM public.users
-- WHERE id IN (
--   '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
--   '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
-- );
-- AND id NOT IN ('3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid);

-- Normalize phone on remaining test users (helps login + driver match):
-- UPDATE public.users
-- SET phone = '524151816902', phone_verified = true
-- WHERE phone LIKE '%4151816902%'
--    OR phone IN ('+524151816902', '5214151816902');

COMMIT;

-- ── 6. Verify empty ───────────────────────────────────────────────────────────
SELECT 'driver_profiles' AS tbl, count(*) AS n FROM public.driver_profiles
UNION ALL
SELECT 'ride listings', count(*) FROM public.listings WHERE subcategory_kind = 'ride'
UNION ALL
SELECT 'ride_bookings', count(*) FROM public.ride_bookings;

-- ── 7. After fresh /conductor signup — approve ONE driver (run manually) ───────
-- Replace USER_ID and LISTING_ID from new signup:
--
-- UPDATE public.driver_profiles
-- SET is_active_driver = true, is_online = false, updated_at = now()
-- WHERE user_id = 'PASTE_NEW_USER_ID';
--
-- UPDATE public.listings
-- SET is_verified = true, status = 'active'
-- WHERE id = 'PASTE_NEW_LISTING_ID' AND subcategory_kind = 'ride';
