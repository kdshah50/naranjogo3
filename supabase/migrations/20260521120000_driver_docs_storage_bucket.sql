-- Private bucket for ride driver documents (license, tarjeta de circulación, insurance).
-- Run in Supabase SQL Editor if uploads fail with "bucket driver-docs".

INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-docs', 'driver-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Service role can manage driver docs" ON storage.objects;

CREATE POLICY "Service role can manage driver docs"
ON storage.objects FOR ALL
USING (bucket_id = 'driver-docs')
WITH CHECK (bucket_id = 'driver-docs');
