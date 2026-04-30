-- Columns expected by POST /rest/v1/listings from provider-signup and app/api/listings.
-- Repo base migration (listings_architecture) used legacy names (category, shipping, photo_urls_json);
-- Next.js inserts use category_id, shipping_available, photo_urls JSONB, etc.
-- Missing any of these yields PostgREST PGRST204 even if description_en was added separately.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS category_id TEXT,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_state TEXT,
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS shipping_available BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS availability_summary TEXT;

-- Legacy installs: populate category_id from historical `category` when both columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category_id'
  ) THEN
    UPDATE public.listings
    SET category_id = category
    WHERE category_id IS NULL AND category IS NOT NULL;
  END IF;
END $$;

-- Legacy installs: keep category <-> category_id in sync when both columns exist (API sends category_id only).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'category_id'
  ) THEN
    CREATE OR REPLACE FUNCTION public.listings_sync_category_columns()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF NEW.category IS NULL AND NEW.category_id IS NOT NULL THEN
        NEW.category := NEW.category_id;
      ELSIF NEW.category_id IS NULL AND NEW.category IS NOT NULL THEN
        NEW.category_id := NEW.category;
      END IF;
      RETURN NEW;
    END;
    $fn$;
    DROP TRIGGER IF EXISTS trg_listings_sync_category_columns ON public.listings;
    CREATE TRIGGER trg_listings_sync_category_columns
      BEFORE INSERT OR UPDATE ON public.listings
      FOR EACH ROW
      EXECUTE PROCEDURE public.listings_sync_category_columns();
  END IF;
END $$;

-- Ask PostgREST to pick up DDL (hosted Supabase / local stacks that listen for this NOTIFY).
NOTIFY pgrst, 'reload schema';
