-- Private bucket for ride driver documents (license, tarjeta de circulación, insurance).
-- Run in Supabase SQL Editor if uploads fail with "bucket driver-docs" or MIME errors.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-docs',
  'driver-docs',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Service role can manage driver docs" ON storage.objects;

CREATE POLICY "Service role can manage driver docs"
ON storage.objects FOR ALL
USING (bucket_id = 'driver-docs')
WITH CHECK (bucket_id = 'driver-docs');
