-- Tianguis listings — aligned with arch doc §4.3, §5.2, §6.1
-- Apply in Supabase: SQL Editor → New query → Run
-- Id type: TEXT UUID string (matches listings-api SQLModel)

CREATE TABLE IF NOT EXISTS public.listings (
  id TEXT PRIMARY KEY,

  seller_id TEXT,

  -- Seller content (§4.3 webhook uses title_es / description_es)
  title_es TEXT NOT NULL,
  title_en TEXT,
  description_es TEXT NOT NULL DEFAULT '',
  description_en TEXT,

  price_mxn INTEGER NOT NULL CHECK (price_mxn >= 0),
  category TEXT NOT NULL DEFAULT 'other',
  condition TEXT NOT NULL DEFAULT 'good',
  estado TEXT NOT NULL DEFAULT 'CDMX',

  negotiable BOOLEAN NOT NULL DEFAULT FALSE,
  shipping BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cloudflare / CDN URLs (JSON array as text; same as app layer)
  photo_urls_json TEXT NOT NULL DEFAULT '[]',
  photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count >= 0 AND photo_count <= 50),

  status TEXT NOT NULL DEFAULT 'draft',

  -- ML / AI persistence (§6.1) — filled after Listings → ML webhook response
  ai_category TEXT,
  ai_category_confidence DOUBLE PRECISION,
  ai_raw_labels_json TEXT NOT NULL DEFAULT '[]',

  suggested_price_mxn INTEGER,
  suggested_price_min_mxn INTEGER,
  suggested_price_max_mxn INTEGER,
  price_comparables_count INTEGER,
  price_fallback_used BOOLEAN,

  fraud_phash TEXT,
  fraud_is_stock_photo BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_price_below_floor BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_review_required BOOLEAN NOT NULL DEFAULT FALSE,

  ml_processing_ms INTEGER,
  ml_cached BOOLEAN,
  ml_updated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON public.listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings (category);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings (created_at DESC);

COMMENT ON TABLE public.listings IS 'Marketplace listings — Tianguis arch §6.1';
