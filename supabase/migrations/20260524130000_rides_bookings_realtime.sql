-- Enable Supabase Realtime on ride_bookings (server-side SSE bridge uses service role).
-- ADDITIVE ONLY.

ALTER TABLE public.ride_bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ride_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_bookings;
  END IF;
END $$;

COMMENT ON TABLE public.ride_bookings IS
  'Ride lifecycle; Realtime enabled for in-app live updates via /api/rides/*/stream.';
