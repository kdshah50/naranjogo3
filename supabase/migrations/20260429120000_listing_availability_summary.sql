-- Optional free-text provider availability for service listings (hours, days off, etc.).

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS availability_summary TEXT;

COMMENT ON COLUMN public.listings.availability_summary IS
  'Provider-facing availability notes (e.g. Lun–Sáb 9–18). Shown on listing; optional.';
