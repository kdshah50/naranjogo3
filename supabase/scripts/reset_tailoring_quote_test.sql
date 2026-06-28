-- Reset open tailoring quote/chat state for production E2E testing.
-- Run in Supabase SQL Editor. Review SELECT previews first.
-- Audit log (listing_message_audit_log) keeps historical message copies.

-- 1) Preview tailoring listings
SELECT id, title_es, status, created_at
FROM public.listings
WHERE title_es LIKE 'Arreglos de ropa / costurería —%'
   OR title_es LIKE 'Clothing Alterations / Tailoring —%'
ORDER BY created_at DESC;

-- Optional: one shop only (Centro Histórico example)
-- AND title_es ILIKE '%Centro Histórico%'

-- 2) Preview contact gates with quote state
SELECT g.listing_id, l.title_es, g.buyer_id, g.quote_status, g.quote_sent_at, g.contacted_in_app
FROM public.listing_service_contact_gate g
JOIN public.listings l ON l.id = g.listing_id
WHERE l.title_es LIKE 'Arreglos de ropa / costurería —%'
   OR l.title_es LIKE 'Clothing Alterations / Tailoring —%';

-- 3) RESET quote gates (clears request/quote flow; buyer can submit fresh request)
UPDATE public.listing_service_contact_gate g
SET
  quote_status = 'none',
  quote_line_items = NULL,
  quote_metadata = NULL,
  agreed_subtotal_mxn_cents = NULL,
  seller_set_agreed_price_at = NULL,
  quote_sent_at = NULL,
  quote_responded_at = NULL,
  contacted_in_app = FALSE,
  updated_at = NOW()
FROM public.listings l
WHERE g.listing_id = l.id
  AND (
    l.title_es LIKE 'Arreglos de ropa / costurería —%'
    OR l.title_es LIKE 'Clothing Alterations / Tailoring —%'
  );
  -- AND l.title_es ILIKE '%Centro Histórico%'

-- 4) DELETE in-app chat messages (threads remain; audit log unchanged)
DELETE FROM public.listing_messages m
USING public.listing_conversations c
JOIN public.listings l ON l.id = c.listing_id
WHERE m.conversation_id = c.id
  AND (
    l.title_es LIKE 'Arreglos de ropa / costurería —%'
    OR l.title_es LIKE 'Clothing Alterations / Tailoring —%'
  );
  -- AND l.title_es ILIKE '%Centro Histórico%'

-- 5) Cancel open bookings that block a new checkout
UPDATE public.service_bookings b
SET status = 'cancelled', updated_at = NOW()
FROM public.listings l
WHERE b.listing_id = l.id
  AND b.status IN ('pending', 'confirmed', 'scheduled', 'in_progress')
  AND (
    l.title_es LIKE 'Arreglos de ropa / costurería —%'
    OR l.title_es LIKE 'Clothing Alterations / Tailoring —%'
  );
  -- AND l.title_es ILIKE '%Centro Histórico%'
