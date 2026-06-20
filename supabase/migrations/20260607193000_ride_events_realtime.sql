-- Uber/Didi-style lifecycle push: SSE bridges ride_events INSERT (authoritative log).
-- ADDITIVE ONLY.

ALTER TABLE public.ride_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ride_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_events;
  END IF;
END $$;

COMMENT ON TABLE public.ride_events IS
  'Append-only ride lifecycle log; Realtime enabled for /api/rides/*/stream lifecycle push.';
