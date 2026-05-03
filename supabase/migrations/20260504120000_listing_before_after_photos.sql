-- Optional before/after photo pairs (e.g. services) — JSON array of { "before": "url", "after": "url" }.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS before_after_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.listings.before_after_photo_urls IS
  'Trust/demand gen: [{ "before": "https://...", "after": "https://..." }, ...]. Shown on listing when non-empty.';

NOTIFY pgrst, 'reload schema';
