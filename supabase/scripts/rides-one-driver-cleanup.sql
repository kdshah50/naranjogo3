-- =============================================================================
-- ONE driver for test phone 415 181 6902 / 524151816902 (preview only)
-- =============================================================================
-- Keeps:  3d5522b3-aedf-4625-80a1-8a79708bb893  (Carme / canonical driver)
-- Drops:  94a74ff0-d2f4-46a7-b43e-85fb8f2cf524, 7003532b-1bba-4bbe-8b7e-b89e86051169
--
-- Run entire file in Supabase SQL Editor (preview DB).
-- After: log out at /unete on BOTH phones → log in again with 415 181 6902.
-- =============================================================================

-- Canonical IDs (edit only if your §1 SELECT shows a different KEEP row)
-- KEEP_ID: 3d5522b3-aedf-4625-80a1-8a79708bb893

-- §1 — BEFORE: users + driver profiles for this phone
SELECT 'users' AS section, id, phone, display_name, created_at
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY created_at;

SELECT 'driver_profiles' AS section, user_id, is_active_driver, is_online, vehicle_make, updated_at
FROM public.driver_profiles
WHERE user_id IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
  '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
);

-- §2 — Phase 4 columns (safe re-run)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

BEGIN;

-- §3 — Cancel open rides on ANY duplicate driver id (clean slate for new test)
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'one_driver_cleanup',
    updated_at = now()
WHERE driver_id IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
  '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
)
AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

-- §4 — One driver_profiles row on canonical user (copy best profile if needed)
INSERT INTO public.driver_profiles (
  user_id,
  license_number,
  license_expiry,
  license_photo_url,
  vehicle_make,
  vehicle_model,
  vehicle_year,
  vehicle_color,
  vehicle_plates,
  vehicle_card_photo_url,
  insurance_provider,
  insurance_policy,
  insurance_expiry,
  insurance_photo_url,
  service_colonias,
  background_check_status,
  is_active_driver,
  is_online
)
SELECT
  '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
  license_number,
  license_expiry,
  license_photo_url,
  vehicle_make,
  vehicle_model,
  vehicle_year,
  vehicle_color,
  vehicle_plates,
  vehicle_card_photo_url,
  insurance_provider,
  insurance_policy,
  insurance_expiry,
  insurance_photo_url,
  COALESCE(service_colonias, ARRAY['centro','guadalupe','olimpo']::text[]),
  COALESCE(background_check_status, 'none'),
  true,
  false
FROM public.driver_profiles
WHERE user_id IN (
  '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
  '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
)
ORDER BY is_active_driver DESC, updated_at DESC NULLS LAST
LIMIT 1
ON CONFLICT (user_id) DO UPDATE SET
  is_active_driver = true,
  is_online = false,
  service_colonias = EXCLUDED.service_colonias,
  updated_at = now();

DELETE FROM public.driver_profiles
WHERE user_id IN (
  '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
  '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
);

-- §5 — Ride listing on canonical driver (adjust listing id if yours differs)
UPDATE public.listings
SET seller_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid,
    subcategory_kind = 'ride',
    is_verified = true,
    status = 'active'
WHERE id = 'b805f14c-2f3b-497f-bcf6-0748d84670bc'::uuid
   OR (subcategory_kind = 'ride' AND seller_id IN (
     '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524'::uuid,
     '7003532b-1bba-4bbe-8b7e-b89e86051169'::uuid
   ));

-- §6 — Repoint rides + wallets to canonical user, then remove duplicate users
DO $$
DECLARE
  keep_id uuid := '3d5522b3-aedf-4625-80a1-8a79708bb893';
  drop_ids uuid[] := ARRAY[
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ]::uuid[];
  d uuid;
BEGIN
  FOREACH d IN ARRAY drop_ids LOOP
    IF d = keep_id THEN CONTINUE; END IF;

    UPDATE public.ride_bookings SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.ride_bookings SET driver_id = keep_id WHERE driver_id = d;
    UPDATE public.driver_profiles SET user_id = keep_id WHERE user_id = d;
    UPDATE public.listings SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.service_bookings SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.service_bookings SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.listing_conversations SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.listing_conversations SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.listing_messages SET sender_id = keep_id WHERE sender_id = d;
    UPDATE public.wallets SET user_id = keep_id WHERE user_id = d;
    UPDATE public.wallet_ledger SET user_id = keep_id WHERE user_id = d;
    UPDATE public.loyalty_accounts SET user_id = keep_id WHERE user_id = d;
    UPDATE public.loyalty_transactions SET user_id = keep_id WHERE user_id = d;
    UPDATE public.marketplace_orders SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.marketplace_orders SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.reports SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.seller_reviews SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.seller_reviews SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.guarantee_claims SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.guarantee_claims SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.booking_reminders SET buyer_id = keep_id WHERE buyer_id = d;
    UPDATE public.booking_reminders SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.seller_strike_events SET seller_id = keep_id WHERE seller_id = d;
    UPDATE public.users SET referred_by = keep_id WHERE referred_by = d;

    DELETE FROM public.referral_codes WHERE user_id = d;
    DELETE FROM public.user_favorite_listings WHERE user_id = d;
    DELETE FROM public.users WHERE id = d;
  END LOOP;
END $$;

-- §7 — Canonical phone on KEEP user (skip if unique constraint blocks)
UPDATE public.users
SET phone = '524151816902',
    phone_verified = true
WHERE id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid;

COMMIT;

-- §8 — AFTER: should be ONE user + ONE driver profile
SELECT 'users_after' AS section, id, phone, display_name
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY created_at;

SELECT 'driver_after' AS section, user_id, is_active_driver, is_online, vehicle_make
FROM public.driver_profiles
WHERE user_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid;

SELECT 'open_rides_after' AS section, count(*)::int AS n
FROM public.ride_bookings
WHERE driver_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'::uuid
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip', 'requested');

-- Expected: 1 user row, 1 driver_profiles row, open_rides = 0
-- Then: log out both browsers → /unete → 415 181 6902
-- Driver: /conductor/viajes  Rider: /viaje (or use a second phone for rider if you prefer)
