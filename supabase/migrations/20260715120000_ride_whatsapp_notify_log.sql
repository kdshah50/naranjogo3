-- Append-only audit of taxi WhatsApp lifecycle notifies.
-- Body + recipient phone stored encrypted (app-layer enc:v1: via PII_ENCRYPTION_KEY).
-- ADDITIVE ONLY.

CREATE TABLE IF NOT EXISTS public.ride_whatsapp_notify_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id             UUID NULL REFERENCES public.ride_bookings(id) ON DELETE SET NULL,
  ticket_code         TEXT NULL,
  phase               TEXT NOT NULL,
  recipient_role      TEXT NOT NULL CHECK (recipient_role IN ('buyer', 'driver')),
  recipient_user_id   TEXT NULL,
  recipient_phone_enc TEXT NULL,
  body_enc            TEXT NOT NULL,
  twilio_ok           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_whatsapp_notify_created
  ON public.ride_whatsapp_notify_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ride_whatsapp_notify_ride
  ON public.ride_whatsapp_notify_log (ride_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ride_whatsapp_notify_ticket
  ON public.ride_whatsapp_notify_log (ticket_code, created_at DESC)
  WHERE ticket_code IS NOT NULL;

COMMENT ON TABLE public.ride_whatsapp_notify_log IS
  'Append-only log of ride WhatsApp sends. body_enc and recipient_phone_enc are enc:v1: ciphertext.';

ALTER TABLE public.ride_whatsapp_notify_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_whatsapp_notify_service_role ON public.ride_whatsapp_notify_log;
CREATE POLICY ride_whatsapp_notify_service_role
  ON public.ride_whatsapp_notify_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.deny_ride_whatsapp_notify_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ride_whatsapp_notify_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_ride_whatsapp_notify_no_update ON public.ride_whatsapp_notify_log;
DROP TRIGGER IF EXISTS trg_ride_whatsapp_notify_no_delete ON public.ride_whatsapp_notify_log;

CREATE TRIGGER trg_ride_whatsapp_notify_no_update
  BEFORE UPDATE ON public.ride_whatsapp_notify_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_ride_whatsapp_notify_mutation();

CREATE TRIGGER trg_ride_whatsapp_notify_no_delete
  BEFORE DELETE ON public.ride_whatsapp_notify_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_ride_whatsapp_notify_mutation();
