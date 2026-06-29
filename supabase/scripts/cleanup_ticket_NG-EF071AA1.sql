-- Cleanup bad test state for tailoring ticket NG-EF071AA1 (Carme ↔ Kay, Centro Histórico).
-- Run on PRODUCTION Supabase (erfsvaddrspmlavvulne). Review SELECTs first.
-- Does NOT refund Stripe — keeps payment_status = paid for audit; sets lifecycle to cancelled.
-- After this, Carme can start a fresh quote request + new checkout (new NG- ticket).

-- 0) Preview
SELECT id, ticket_code, status, payment_status, paid_at, buyer_id, listing_id
FROM public.service_bookings
WHERE ticket_code ILIKE 'NG-EF071AA1';

SELECT quote_status, quote_sent_at, quote_responded_at, contacted_in_app
FROM public.listing_service_contact_gate
WHERE listing_id = 'ce73ae13-155d-4f76-837b-300e2c2795ad'::uuid
  AND buyer_id = '3d5522b3-aedf-4625-80a1-8a79708bb893';

-- 1) Close NG-EF071AA1 (paid but messy — lock as cancelled test row)
UPDATE public.service_bookings
SET
  status = 'cancelled',
  updated_at = NOW()
WHERE ticket_code ILIKE 'NG-EF071AA1'
  AND payment_status = 'paid';

-- 2) Cancel any other NON-terminal bookings for Carme on this listing (blocks new checkout if confirmed)
UPDATE public.service_bookings
SET status = 'cancelled', updated_at = NOW()
WHERE listing_id = 'ce73ae13-155d-4f76-837b-300e2c2795ad'::uuid
  AND buyer_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND payment_status = 'paid'
  AND status IN ('pending', 'confirmed', 'scheduled', 'in_progress');

-- 3) Reset quote gate — fresh request / quote / accept / pay flow
UPDATE public.listing_service_contact_gate
SET
  quote_status = 'none',
  quote_line_items = NULL,
  quote_metadata = NULL,
  agreed_subtotal_mxn_cents = NULL,
  seller_set_agreed_price_at = NULL,
  quote_sent_at = NULL,
  quote_responded_at = NULL,
  contacted_in_app = TRUE,
  updated_at = NOW()
WHERE listing_id = 'ce73ae13-155d-4f76-837b-300e2c2795ad'::uuid
  AND buyer_id = '3d5522b3-aedf-4625-80a1-8a79708bb893';

-- 4) Verify (expect: EF071AA1 cancelled/paid; gate quote_status none; no active paid rows)
SELECT ticket_code, status, payment_status
FROM public.service_bookings
WHERE listing_id = 'ce73ae13-155d-4f76-837b-300e2c2795ad'::uuid
  AND buyer_id = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND payment_status = 'paid'
ORDER BY paid_at DESC;

SELECT quote_status, contacted_in_app FROM public.listing_service_contact_gate
WHERE listing_id = 'ce73ae13-155d-4f76-837b-300e2c2795ad'::uuid
  AND buyer_id = '3d5522b3-aedf-4625-80a1-8a79708bb893';

-- Optional step 5: clear chat for a visually clean thread (audit log keeps copies).
/*
DELETE FROM public.listing_messages
WHERE conversation_id = 'f8f1eb12-765a-4b10-8b1a-6a71145bc144';
*/
