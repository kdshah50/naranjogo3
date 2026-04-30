-- Optional automated scheduling: external calendar sync surfaces real openings as rows here.
-- Booking flow (contact gate → platform fee → WhatsApp) is unchanged; slots are informational.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calendar_provider TEXT,
  ADD COLUMN IF NOT EXISTS calendar_last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.listings.calendar_sync_enabled IS
  'When true, provider has connected or supplies a feed; listing_live_availability_slots should be refreshed by sync jobs.';
COMMENT ON COLUMN public.listings.calendar_provider IS
  'Optional label for the connected system: google, microsoft, apple, ical, other.';
COMMENT ON COLUMN public.listings.calendar_last_synced_at IS
  'Last time openings were written from the provider calendar (or manual import).';

CREATE TABLE IF NOT EXISTS public.listing_live_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'calendar' CHECK (source IN ('calendar', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (slot_end > slot_start)
);

CREATE INDEX IF NOT EXISTS idx_listing_live_slots_listing_start
  ON public.listing_live_availability_slots (listing_id, slot_start);

COMMENT ON TABLE public.listing_live_availability_slots IS
  'Upcoming free intervals for a listing, derived from office-calendar sync or manual entry; public read via server only.';

ALTER TABLE public.listing_live_availability_slots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
