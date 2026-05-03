-- Provider ranking for search: behavior + reviews + admin soft penalty (bypass / trust).
-- Multiplier clamps to [0.25, 1.28] after combining behavior signals and seller penalty (0.25–1.0).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS provider_rank_multiplier numeric DEFAULT 1.0;

UPDATE public.users SET provider_rank_multiplier = 1.0 WHERE provider_rank_multiplier IS NULL;

ALTER TABLE public.users
  ALTER COLUMN provider_rank_multiplier SET DEFAULT 1.0;

ALTER TABLE public.users
  ALTER COLUMN provider_rank_multiplier SET NOT NULL;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_provider_rank_multiplier_chk;
ALTER TABLE public.users
  ADD CONSTRAINT users_provider_rank_multiplier_chk
  CHECK (provider_rank_multiplier >= 0.25 AND provider_rank_multiplier <= 1.0);

COMMENT ON COLUMN public.users.provider_rank_multiplier IS
  'Search visibility (default 1). Lower e.g. 0.55 to soft-penalize platform bypass; restore to 1 when resolved.';

CREATE OR REPLACE FUNCTION public.get_listing_rank_multipliers(p_listing_ids text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH ids AS (
  SELECT DISTINCT trim(t.lid) AS listing_id
  FROM unnest(COALESCE(p_listing_ids, ARRAY[]::text[])) AS t(lid)
  WHERE trim(t.lid) <> ''
),
book AS (
  SELECT sb.listing_id::text AS listing_id,
    COUNT(*) FILTER (WHERE sb.payment_status = 'paid')::numeric AS paid_n,
    COUNT(*) FILTER (WHERE sb.payment_status = 'paid' AND sb.status = 'completed')::numeric AS done_n,
    COUNT(*) FILTER (WHERE sb.payment_status = 'paid' AND sb.status = 'cancelled')::numeric AS can_n
  FROM public.service_bookings sb
  WHERE sb.listing_id::text IN (SELECT listing_id FROM ids)
  GROUP BY sb.listing_id
),
rpt AS (
  SELECT x.listing_id, COUNT(*)::numeric AS repeat_buyers
  FROM (
    SELECT sb.listing_id::text AS listing_id
    FROM public.service_bookings sb
    WHERE sb.payment_status = 'paid'
      AND sb.listing_id::text IN (SELECT listing_id FROM ids)
    GROUP BY sb.listing_id, sb.buyer_id
    HAVING COUNT(*) >= 2
  ) x
  GROUP BY x.listing_id
),
resp AS (
  SELECT c.listing_id AS listing_id,
    percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (sm.first_seller - bm.first_buyer)) / 3600.0
    ) AS med_h
  FROM public.listing_conversations c
  INNER JOIN LATERAL (
    SELECT MIN(m.created_at) AS first_buyer
    FROM public.listing_messages m
    WHERE m.conversation_id = c.id AND m.sender_id = c.buyer_id
  ) bm ON bm.first_buyer IS NOT NULL
  INNER JOIN LATERAL (
    SELECT MIN(m.created_at) AS first_seller
    FROM public.listing_messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id = c.seller_id
      AND m.created_at >= bm.first_buyer
  ) sm ON sm.first_seller IS NOT NULL
  WHERE c.listing_id IN (SELECT listing_id FROM ids)
  GROUP BY c.listing_id
),
rev AS (
  SELECT sr.listing_id::text AS listing_id,
    AVG(sr.rating::numeric) AS avg_r,
    COUNT(*)::int AS rev_n
  FROM public.seller_reviews sr
  WHERE sr.listing_id::text IN (SELECT listing_id FROM ids)
  GROUP BY sr.listing_id
),
seller_pen AS (
  SELECT l.id::text AS listing_id,
    COALESCE(u.provider_rank_multiplier, 1.0)::numeric AS penalty
  FROM public.listings l
  LEFT JOIN public.users u
    ON lower(trim(both from u.id)) = lower(trim(both from l.seller_id))
  WHERE l.id::text IN (SELECT listing_id FROM ids)
),
scored AS (
  SELECT
    i.listing_id,
    COALESCE(sp.penalty, 1.0) AS seller_penalty,
    CASE
      WHEN COALESCE(b.paid_n, 0) < 1 THEN 1.0::numeric
      ELSE GREATEST(0.62::numeric, LEAST(1.0::numeric, 0.55 + 0.45 * (b.done_n / NULLIF(b.paid_n, 0))))
    END AS completion_part,
    CASE
      WHEN COALESCE(b.paid_n, 0) < 1 THEN 1.0::numeric
      ELSE GREATEST(
        0.70::numeric,
        1.0 - LEAST(0.30::numeric, (COALESCE(b.can_n, 0) / NULLIF(b.paid_n, 0)) * 1.15)
      )
    END AS cancel_part,
    CASE
      WHEN r.med_h IS NULL THEN 0.92::numeric
      WHEN r.med_h <= 1 THEN 1.0::numeric
      WHEN r.med_h <= 6 THEN 0.94::numeric
      WHEN r.med_h <= 24 THEN 0.85::numeric
      WHEN r.med_h <= 72 THEN 0.76::numeric
      ELSE 0.65::numeric
    END AS resp_part,
    (1.0::numeric + LEAST(0.12, COALESCE(rpt.repeat_buyers, 0) * 0.04)) AS repeat_part,
    CASE
      WHEN COALESCE(rv.rev_n, 0) < 2 THEN 1.0::numeric
      ELSE 1.0::numeric + LEAST(0.08::numeric, GREATEST(0::numeric, (COALESCE(rv.avg_r, 0) - 3.0) / 35.0))
    END AS review_part
  FROM ids i
  LEFT JOIN book b ON b.listing_id = i.listing_id
  LEFT JOIN rpt ON rpt.listing_id = i.listing_id
  LEFT JOIN resp r ON r.listing_id = i.listing_id
  LEFT JOIN rev rv ON rv.listing_id = i.listing_id
  LEFT JOIN seller_pen sp ON sp.listing_id = i.listing_id
)
SELECT COALESCE(
  jsonb_object_agg(
    scored.listing_id,
    to_jsonb(
      LEAST(1.28::numeric, GREATEST(0.25::numeric,
        ROUND(
          (
            scored.completion_part * scored.cancel_part * scored.resp_part
            * scored.repeat_part * scored.review_part * scored.seller_penalty
          )::numeric,
          4
        )
      ))
    )
  ),
  '{}'::jsonb
)
FROM scored;
$$;

COMMENT ON FUNCTION public.get_listing_rank_multipliers(text[]) IS
  'Listing-level search multiplier from completion/cancel/repeat/response/reviews times users.provider_rank_multiplier.';

GRANT EXECUTE ON FUNCTION public.get_listing_rank_multipliers(text[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
