-- Sample listing: category_id = electronics (non-service smoke test).
-- Run in Supabase → SQL Editor as postgres (or any role with INSERT on public.listings).
--
-- Prerequisites:
--   • At least one row in public.users (uses the oldest account as seller).
--   • Your listings table must match the app (category_id, is_verified, photo_urls, etc.).
--
-- After run: open https://yoursite/?category=electronics
--
-- Cleanup:
--   DELETE FROM public.listings WHERE title_es LIKE '%demo Electrónica%';

INSERT INTO public.listings (
  id,
  seller_id,
  title_es,
  title_en,
  description_es,
  price_mxn,
  category_id,
  condition,
  status,
  is_verified,
  location_city,
  location_state,
  zip_code,
  location_lat,
  location_lng,
  shipping_available,
  negotiable,
  photo_urls,
  payment_methods,
  expires_at
)
SELECT
  gen_random_uuid(),
  u.id,
  'Auriculares Bluetooth (demo Electrónica)',
  'Bluetooth headphones (electronics demo)',
  'Anuncio de prueba para validar la categoría Electrónica en el sitio. No es una oferta real — puedes archivarlo o borrarlo después.',
  250000, -- centavos = $2,500 MXN (mínimo electronics en la app: 50_000 = $500 MXN)
  'electronics',
  'good',
  'active',
  true,
  'San Miguel de Allende',
  'Guanajuato',
  '37700',
  20.91528,
  -100.74389,
  true,
  true,
  '[]'::jsonb,
  ARRAY['efectivo', 'whatsapp']::text[],
  (now() + interval '90 days')
FROM public.users AS u
ORDER BY u.created_at ASC
LIMIT 1
RETURNING id, title_es, category_id, is_verified, status;

-- If id is TEXT (not UUID), replace gen_random_uuid() with gen_random_uuid()::text
--
-- payment_methods is text[] in this project (not jsonb).
-- If photo_urls errors: try '{}'::jsonb, '[]', or ARRAY[]::text[] depending on column type.
