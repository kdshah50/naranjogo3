-- Fix message insert failures: digest() lives in extensions schema on Supabase.
-- Symptom: buyers/providers see "Could not send" / "No se pudo enviar la solicitud".

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.audit_listing_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET row_security = off
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
    encode(extensions.digest(NEW.body, 'sha256'::text), 'hex'),
    v_source,
    NEW.created_at
  )
  ON CONFLICT (message_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS listing_message_audit_service_role ON public.listing_message_audit_log;

CREATE POLICY listing_message_audit_service_role
  ON public.listing_message_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
