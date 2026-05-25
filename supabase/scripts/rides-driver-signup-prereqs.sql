-- Run in Supabase SQL Editor if /conductor signup returns 500 or photo upload fails.
-- Safe to re-run (IF NOT EXISTS).

-- Phase 1: driver_profiles + listings.subcategory_kind
-- (full file: supabase/migrations/20260520120000_rides_driver_profiles.sql)

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS subcategory_kind TEXT NULL;

CREATE TABLE IF NOT EXISTS public.driver_profiles (
  user_id                  TEXT PRIMARY KEY,
  license_number           TEXT NOT NULL,
  license_expiry           DATE NOT NULL,
  license_photo_url        TEXT NOT NULL,
  vehicle_make             TEXT NOT NULL,
  vehicle_model            TEXT NOT NULL,
  vehicle_year             INT NOT NULL CHECK (vehicle_year >= 1985 AND vehicle_year <= 2100),
  vehicle_color            TEXT NOT NULL,
  vehicle_plates           TEXT NOT NULL,
  vehicle_card_photo_url   TEXT NOT NULL,
  insurance_provider       TEXT NOT NULL,
  insurance_policy         TEXT NOT NULL,
  insurance_expiry         DATE NOT NULL,
  insurance_photo_url      TEXT NOT NULL,
  service_colonias         TEXT[] NOT NULL DEFAULT '{}',
  background_check_status  TEXT NOT NULL DEFAULT 'none',
  is_active_driver         BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Listings columns used by POST /api/driver-signup
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
  ADD COLUMN IF NOT EXISTS description_en TEXT;

-- Phase 4: online (Conectar)
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ NULL;

-- Storage bucket for license / tarjeta / insurance photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-docs',
  'driver-docs',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';

SELECT 'driver_profiles' AS check_name, count(*)::int AS n FROM public.driver_profiles
UNION ALL
SELECT 'subcategory_kind column',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'subcategory_kind'
  ) THEN 1 ELSE 0 END;
