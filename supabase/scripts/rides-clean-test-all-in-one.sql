-- =============================================================================
-- RIDES — clean test (all-in-one) — Supabase SQL Editor, PREVIEW ONLY
-- =============================================================================
-- Order:
--   A) Run sections 1–2 once (reset + Phase 4)
--   B) Tester: log out /unete → complete /conductor signup (415 181 6902)
--   C) Run section 3 (auto-approve newest driver + listing)
--   D) Tester: log in /unete → /conductor/viajes → Conectar
--
-- Do NOT run on production unless you intend to wipe rides data.
-- =============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Phase 4 — driver online / GPS columns (safe to re-run)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_online
  ON public.driver_profiles (is_online, is_active_driver)
  WHERE is_online = true AND is_active_driver = true;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Reset all rides driver + booking test data
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM public.wallet_ledger
WHERE ride_booking_id IS NOT NULL;

DELETE FROM public.ride_events
WHERE ride_id IN (SELECT id FROM public.ride_bookings);

DELETE FROM public.ride_bookings;

DELETE FROM public.driver_profiles;

DELETE FROM public.listings
WHERE subcategory_kind = 'ride';

COMMIT;

-- Driver photos: Dashboard → Storage → bucket "driver-docs" → delete (SQL not allowed)


-- ══════════════════════════════════════════════════════════════════════════════
-- 2b. Verify reset (expect 0, 0, 0)
-- ══════════════════════════════════════════════════════════════════════════════

SELECT 'driver_profiles' AS tbl, count(*)::int AS n FROM public.driver_profiles
UNION ALL
SELECT 'ride listings', count(*)::int FROM public.listings WHERE subcategory_kind = 'ride'
UNION ALL
SELECT 'ride_bookings', count(*)::int FROM public.ride_bookings;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2c. Duplicate users for test phone (OK to leave multiple rows)
--     Do NOT set the same phone on every row — users_phone_key is UNIQUE.
-- ══════════════════════════════════════════════════════════════════════════════

SELECT id, phone, display_name, created_at
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY created_at;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. AFTER /conductor signup — auto-approve newest driver + ride listing
--    (Run only when driver_profiles has at least one row)
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.driver_profiles
SET
  is_active_driver = true,
  is_online = false,
  updated_at = now()
WHERE user_id = (
  SELECT user_id
  FROM public.driver_profiles
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1
);

UPDATE public.listings
SET
  is_verified = true,
  status = 'active',
  updated_at = now()
WHERE id = (
  SELECT id
  FROM public.listings
  WHERE subcategory_kind = 'ride'
  ORDER BY created_at DESC
  LIMIT 1
);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3b. Verify approval (ready for Conectar)
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  dp.user_id,
  dp.is_active_driver,
  dp.is_online,
  l.id AS listing_id,
  l.is_verified,
  l.status,
  u.phone,
  u.display_name
FROM public.driver_profiles dp
LEFT JOIN public.listings l
  ON l.seller_id::text = dp.user_id AND l.subcategory_kind = 'ride'
LEFT JOIN public.users u
  ON u.id::text = dp.user_id
ORDER BY dp.created_at DESC
LIMIT 1;

-- Expected: is_active_driver true, is_online false, is_verified true, status active
