-- One-time cleanup: remove ALL listings classified as services (fresh start for service catalog).
--
-- Matches app logic in lib/listing-category.ts (`category_id` = "services", case-insensitive).
-- Installs without a legacy `listings.category` column use only category_id below.
--
-- Related rows CASCADE from public.listings in this project, including:
--   listing_conversations (+ messages), service_bookings, contact_gate, booking_requests,
--   booking_reminders, guarantee_claims, seller_reviews for those listings, favorites,
--   listing_live_availability_slots, etc.
--   reports.listing_id → SET NULL (report rows kept).
--   loyalty_transactions.booking_id → SET NULL when bookings are removed.
--
-- Does NOT delete: users, non-service listings, cart (if any), storage objects (orphan images may remain in bucket).
--
-- HOW TO RUN (production)
--   1) Supabase Dashboard → SQL Editor → paste the PREVIEW below, run, confirm count/titles.
--   2) Run the DELETE when sure (or run this whole file via `supabase db push` / migration pipeline).
--
-- PREVIEW (optional — run alone first):
--   SELECT id, title_es, category_id, status, created_at
--   FROM public.listings
--   WHERE LOWER(TRIM(COALESCE(category_id, ''))) = 'services'
--   ORDER BY created_at DESC;

DELETE FROM public.listings
WHERE LOWER(TRIM(COALESCE(category_id, ''))) = 'services';
