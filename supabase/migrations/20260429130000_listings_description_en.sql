-- Provider signup and some flows send description_en alongside description_es.
-- Add if your listings table was created without this column (avoids PostgREST PGRST204).

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS description_en TEXT;

COMMENT ON COLUMN public.listings.description_en IS 'Optional English description mirror (e.g. provider signup bilingual footer).';
