-- Gated quote flow (housekeeping MVP): provider sends quote → buyer accepts → deposit checkout.

ALTER TABLE public.listing_service_contact_gate
  ADD COLUMN IF NOT EXISTS quote_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS quote_line_items JSONB,
  ADD COLUMN IF NOT EXISTS quote_metadata JSONB,
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_responded_at TIMESTAMPTZ;

ALTER TABLE public.listing_service_contact_gate
  DROP CONSTRAINT IF EXISTS listing_service_contact_gate_quote_status_chk;

ALTER TABLE public.listing_service_contact_gate
  ADD CONSTRAINT listing_service_contact_gate_quote_status_chk
  CHECK (quote_status IN ('none', 'pending', 'accepted', 'declined'));

COMMENT ON COLUMN public.listing_service_contact_gate.quote_status IS
  'Quote lifecycle for menu services (e.g. limpieza): none → pending (sent) → accepted | declined.';
COMMENT ON COLUMN public.listing_service_contact_gate.quote_line_items IS
  'Optional [{ sku, qty, name_es, price_mxn_cents }] snapshot when provider sends quote.';
COMMENT ON COLUMN public.listing_service_contact_gate.quote_metadata IS
  'Optional { visitFrequency, quoteBasis, buyerNotes, lang } for housekeeping quotes.';
