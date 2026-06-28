/*
  Full apply / repair for listing message audit (migration 20260626120000).
  Run this entire file in Supabase SQL Editor if:
    - message_source column is missing, OR
    - you hit "listing_messages body and metadata are immutable"

  Safe to re-run (idempotent).
*/

DROP TRIGGER IF EXISTS trg_listing_messages_no_update ON public.listing_messages;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.listing_messages
  ADD COLUMN IF NOT EXISTS message_source TEXT NOT NULL DEFAULT 'user';

ALTER TABLE public.listing_messages
  DROP CONSTRAINT IF EXISTS listing_messages_source_check;

ALTER TABLE public.listing_messages
  ADD CONSTRAINT listing_messages_source_check
  CHECK (
    message_source IN (
      'user',
      'system',
      'quote_request',
      'quote_send',
      'quote_respond',
      'payment',
      'booking_lifecycle'
    )
  );

COMMENT ON COLUMN public.listing_messages.message_source IS
  'Origin of the message: user chat, quote flow, payment notice, booking lifecycle, or generic system.';

CREATE TABLE IF NOT EXISTS public.listing_message_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE,
  conversation_id UUID NOT NULL,
  listing_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  message_source TEXT NOT NULL DEFAULT 'user',
  message_created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_message_audit_archived
  ON public.listing_message_audit_log (archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_message_audit_message_created
  ON public.listing_message_audit_log (message_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_message_audit_listing
  ON public.listing_message_audit_log (listing_id, message_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_message_audit_conversation
  ON public.listing_message_audit_log (conversation_id, message_created_at ASC);

COMMENT ON TABLE public.listing_message_audit_log IS
  'Immutable archive of listing chat messages. Service role only; export via /api/admin/message-audit.';

CREATE OR REPLACE FUNCTION public.infer_listing_message_source(p_body TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_body LIKE '[Naranjogo]%' AND p_body LIKE '%pay-deposit-confirmed:%' THEN 'payment'
    WHEN p_body LIKE '[Naranjogo]%' AND p_body LIKE '%quote-accepted:%' THEN 'payment'
    WHEN p_body LIKE '[Naranjogo]%' AND p_body LIKE '%phase:%' THEN 'booking_lifecycle'
    WHEN p_body LIKE '[Naranjogo]%' THEN 'system'
    ELSE 'user'
  END;
$$;

CREATE OR REPLACE FUNCTION public.audit_listing_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_id TEXT;
  v_buyer_id TEXT;
  v_seller_id TEXT;
  v_source TEXT;
BEGIN
  SELECT c.listing_id, c.buyer_id, c.seller_id
  INTO v_listing_id, v_buyer_id, v_seller_id
  FROM public.listing_conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_listing_id IS NULL THEN
    RAISE EXCEPTION 'listing_message audit: conversation % not found', NEW.conversation_id;
  END IF;

  v_source := COALESCE(NULLIF(TRIM(NEW.message_source), ''), public.infer_listing_message_source(NEW.body));

  INSERT INTO public.listing_message_audit_log (
    message_id,
    conversation_id,
    listing_id,
    buyer_id,
    seller_id,
    sender_id,
    body,
    body_sha256,
    message_source,
    message_created_at
  ) VALUES (
    NEW.id,
    NEW.conversation_id,
    v_listing_id,
    v_buyer_id,
    v_seller_id,
    NEW.sender_id,
    NEW.body,
    encode(digest(NEW.body, 'sha256'), 'hex'),
    v_source,
    NEW.created_at
  )
  ON CONFLICT (message_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_listing_message_insert ON public.listing_messages;

CREATE TRIGGER trg_audit_listing_message_insert
  AFTER INSERT ON public.listing_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_listing_message_insert();

UPDATE public.listing_messages m
SET message_source = public.infer_listing_message_source(m.body)
WHERE m.message_source = 'user'
  AND m.body LIKE '[Naranjogo]%';

CREATE OR REPLACE FUNCTION public.deny_listing_message_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing_message_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_message_audit_no_update ON public.listing_message_audit_log;
DROP TRIGGER IF EXISTS trg_listing_message_audit_no_delete ON public.listing_message_audit_log;

CREATE TRIGGER trg_listing_message_audit_no_update
  BEFORE UPDATE ON public.listing_message_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_listing_message_audit_mutation();

CREATE TRIGGER trg_listing_message_audit_no_delete
  BEFORE DELETE ON public.listing_message_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_listing_message_audit_mutation();

CREATE OR REPLACE FUNCTION public.deny_listing_message_body_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.body IS DISTINCT FROM NEW.body
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.message_source IS DISTINCT FROM NEW.message_source
  THEN
    RAISE EXCEPTION 'listing_messages body and metadata are immutable; see listing_message_audit_log';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_messages_no_delete ON public.listing_messages;

CREATE TRIGGER trg_listing_messages_no_update
  BEFORE UPDATE ON public.listing_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_listing_message_body_update();

ALTER TABLE public.listing_message_audit_log ENABLE ROW LEVEL SECURITY;

INSERT INTO public.listing_message_audit_log (
  message_id,
  conversation_id,
  listing_id,
  buyer_id,
  seller_id,
  sender_id,
  body,
  body_sha256,
  message_source,
  message_created_at,
  archived_at
)
SELECT
  m.id,
  m.conversation_id,
  c.listing_id,
  c.buyer_id,
  c.seller_id,
  m.sender_id,
  m.body,
  encode(digest(m.body, 'sha256'), 'hex'),
  COALESCE(NULLIF(TRIM(m.message_source), ''), public.infer_listing_message_source(m.body)),
  m.created_at,
  NOW()
FROM public.listing_messages m
JOIN public.listing_conversations c ON c.id = m.conversation_id
ON CONFLICT (message_id) DO NOTHING;
