-- Repair listing_conversations.seller_id when it drifted from listings.seller_id
-- (orphaned UUID on the row — provider APIs still work via listing owner fallback,
-- but inbox filters and other seller_id joins can miss threads).
--
-- Example (NG-34571817 / Carme ↔ Kay tailoring thread):
--   conversation f8f1eb12-765a-4b10-8b1a-6a71145bc144 had seller_id 8cb261de-… (no users row)
--   listing seller is 8ce0201b-… (Kay Shaw)

UPDATE listing_conversations lc
SET seller_id = l.seller_id::text
FROM listings l
WHERE lc.listing_id::text = l.id::text
  AND lc.seller_id::text IS DISTINCT FROM l.seller_id::text
  AND l.seller_id IS NOT NULL;

-- Verify a specific conversation (optional):
-- SELECT lc.id, lc.seller_id AS conv_seller, l.seller_id::text AS listing_seller
-- FROM listing_conversations lc
-- JOIN listings l ON l.id::text = lc.listing_id::text
-- WHERE lc.id = 'f8f1eb12-765a-4b10-8b1a-6a71145bc144';
