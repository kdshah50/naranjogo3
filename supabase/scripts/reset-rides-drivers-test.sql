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
--   • Driver docs: delete in Dashboard → Storage → driver-docs (SQL not allowed)
--   • Optionally removes duplicate users rows for one test phone (see §4)
--
-- What this does NOT do:
--   • Does not delete buyer wallets/saldo (wallets table stays)
--   • Does not delete non-ride listings or service_bookings
--
-- After running:
--   1. Run Phase 4 migration if missing (see bottom of this file) — required for Conectar
--   2. Tester: clear site cookies OR log out at /unete (tianguis_token)
--   3. One person registers fresh at /conductor with test phone
--   4. Admin approves in SQL (§7) or Supabase table editor
-- =============================================================================

BEGIN;

-- ── 1. Wallet ledger + ride bookings + events ─────────────────────────────────
DELETE FROM public.wallet_ledger
WHERE ride_booking_id IS NOT NULL;

DELETE FROM public.ride_events
WHERE ride_id IN (SELECT id FROM public.ride_bookings);

DELETE FROM public.ride_bookings;

-- ── 2. Driver profiles (all drivers) ──────────────────────────────────────────
DELETE FROM public.driver_profiles;

-- ── 3. Ride driver listings ───────────────────────────────────────────────────
DELETE FROM public.listings
WHERE subcategory_kind = 'ride';

-- ── 4. Driver docs in Storage (optional — NOT via SQL) ───────────────────────
-- Supabase blocks DELETE on storage.objects. Clear files manually:
--   Dashboard → Storage → bucket "driver-docs" → select all → Delete
-- Or skip this step; new signup uploads new doc paths anyway.

-- ── 5. Duplicate users (same phone) ───────────────────────────────────────────
-- Plain DELETE usually fails: FK from listings, service_bookings, wallets, etc.
--
-- Easiest (recommended): only normalize phones — run §A in:
--   supabase/scripts/merge-duplicate-users-by-phone.sql
--
-- To actually remove extra rows: use merge script §D (repoint then delete).

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
-- SET is_active_driver = true, updated_at = now()
-- WHERE user_id = 'PASTE_NEW_USER_ID';
-- (If Phase 4 migration applied, also: is_online = false)
--
-- UPDATE public.listings
-- SET is_verified = true, status = 'active'
-- WHERE id = 'PASTE_NEW_LISTING_ID' AND subcategory_kind = 'ride';

-- =============================================================================
-- PREREQUISITE — Phase 4 columns (run ONCE if Conectar fails / is_online missing)
-- Copy from: supabase/migrations/20260523120000_rides_phase4_driver_online.sql
-- =============================================================================
--
-- ALTER TABLE public.driver_profiles
--   ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
--   ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
--   ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
--   ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;
--
-- CREATE INDEX IF NOT EXISTS idx_driver_profiles_online
--   ON public.driver_profiles (is_online, is_active_driver)
--   WHERE is_online = true AND is_active_driver = true;
