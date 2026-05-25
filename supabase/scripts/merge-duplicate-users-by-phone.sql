-- =============================================================================
-- Merge duplicate users (same phone) — preview / test only
-- =============================================================================
-- DELETE often fails with FK errors (listings, service_bookings, wallets, etc.)
-- This script REPOINTS those rows to one KEEP user, then deletes the extras.
--
-- BEFORE RUNNING:
--   1. Run the SELECT below and pick KEEP_ID (account you want to keep).
--   2. Set KEEP_ID and DROP_IDS in the DO block (bottom).
--   3. Run the whole file in SQL Editor.
--
-- SAFER ALTERNATIVE: Skip merge/delete — only normalize phones (see §A) and
-- do fresh /conductor signup; login code picks the active driver profile.
-- =============================================================================

-- §A — Do NOT set the same phone on every row (users_phone_key is UNIQUE).
-- The app links +52 / 521 / 524 formats via phoneLookupVariants — multiple rows OK.
-- Optional: fix only the "+" row when canonical 524… is not taken yet:
/*
UPDATE public.users u
SET phone = '524151816902', phone_verified = true
WHERE u.phone = '+524151816902'
  AND NOT EXISTS (
    SELECT 1 FROM public.users o
    WHERE o.phone = '524151816902' AND o.id IS DISTINCT FROM u.id
  );
*/

-- §B — See duplicates
SELECT id, phone, display_name, created_at
FROM public.users
WHERE phone LIKE '%4151816902%'
   OR phone IN ('524151816902', '+524151816902', '5214151816902')
ORDER BY created_at;

-- §C — See what blocks DELETE (run for each DROP id)
-- SELECT 'listings' AS src, count(*) FROM public.listings WHERE seller_id::text = 'PASTE_DROP_ID'
-- UNION ALL SELECT 'service_bookings buyer', count(*) FROM public.service_bookings WHERE buyer_id::text = 'PASTE_DROP_ID'
-- UNION ALL SELECT 'service_bookings seller', count(*) FROM public.service_bookings WHERE seller_id::text = 'PASTE_DROP_ID'
-- UNION ALL SELECT 'wallets', count(*) FROM public.wallets WHERE user_id::text = 'PASTE_DROP_ID'
-- UNION ALL SELECT 'wallet_ledger', count(*) FROM public.wallet_ledger WHERE user_id::text = 'PASTE_DROP_ID'
-- UNION ALL SELECT 'listing_conversations', count(*) FROM public.listing_conversations WHERE buyer_id::text = 'PASTE_DROP_ID' OR seller_id::text = 'PASTE_DROP_ID';

-- §D — Repoint + delete (edit IDs, then uncomment and run)
/*
DO $$
DECLARE
  keep_id text := '3d5522b3-aedf-4625-80a1-8a79708bb893';  -- KEEP
  drop_ids text[] := ARRAY[
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ];
  d text;
BEGIN
  FOREACH d IN ARRAY drop_ids LOOP
    IF d = keep_id THEN CONTINUE; END IF;

    UPDATE public.listings SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.service_bookings SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.service_bookings SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.listing_conversations SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.listing_conversations SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.listing_messages SET sender_id = keep_id WHERE sender_id::text = d;
    UPDATE public.wallets SET user_id = keep_id WHERE user_id::text = d;
    UPDATE public.wallet_ledger SET user_id = keep_id WHERE user_id::text = d;
    UPDATE public.loyalty_accounts SET user_id = keep_id WHERE user_id::text = d;
    UPDATE public.loyalty_transactions SET user_id = keep_id WHERE user_id::text = d;
    UPDATE public.marketplace_orders SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.marketplace_orders SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.reports SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.seller_reviews SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.seller_reviews SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.guarantee_claims SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.guarantee_claims SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.booking_reminders SET buyer_id = keep_id WHERE buyer_id::text = d;
    UPDATE public.booking_reminders SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.seller_strike_events SET seller_id = keep_id WHERE seller_id::text = d;
    UPDATE public.driver_profiles SET user_id = keep_id WHERE user_id::text = d;
    UPDATE public.ride_bookings SET buyer_id = keep_id::uuid WHERE buyer_id::text = d;
    UPDATE public.ride_bookings SET driver_id = keep_id::uuid WHERE driver_id::text = d;
    UPDATE public.users SET referred_by = keep_id WHERE referred_by::text = d;

    DELETE FROM public.referral_codes WHERE user_id::text = d;
    DELETE FROM public.user_favorite_listings WHERE user_id::text = d;
    DELETE FROM public.users WHERE id::text = d;
  END LOOP;
END $$;
*/
