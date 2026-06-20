-- =============================================================================
-- Release ALL ride wallet holds for test phone (get saldo back, e.g. $700 MXN)
-- Run in Supabase SQL Editor (preview/staging). Safe to re-run.
-- =============================================================================
-- Test phone Carme: 415 181 6902 / 524151816902
-- Each "Pedir taxi" reserves saldo (hold). SQL-cancelled rides often left holds
-- unreleased — /saldo shows low balance even if you never completed a trip.
-- =============================================================================


-- ── 1) BEFORE — wallet per account ──────────────────────────────────────────

SELECT 'BEFORE wallet' AS step,
       w.user_id,
       round(w.balance_mxn_cents / 100.0, 2) AS balance_mxn,
       round(w.held_mxn_cents / 100.0, 2) AS held_mxn,
       round((w.balance_mxn_cents + w.held_mxn_cents) / 100.0, 2) AS total_mxn
FROM public.wallets w
WHERE w.user_id IN (
  SELECT id::text FROM public.users
  WHERE phone LIKE '%4151816902%'
     OR phone IN ('524151816902', '+524151816902', '5214151816902')
  UNION
  SELECT unnest(ARRAY[
    '3d5522b3-aedf-4625-80a1-8a79708bb893',
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ]::text[])
)
ORDER BY total_mxn DESC;

SELECT 'BEFORE unreleased holds' AS step,
       wl.user_id,
       wl.ride_booking_id,
       round(wl.amount_mxn_cents / 100.0, 2) AS hold_mxn,
       rb.status AS ride_status,
       rb.ticket_code
FROM public.wallet_ledger wl
LEFT JOIN public.ride_bookings rb ON rb.id = wl.ride_booking_id
WHERE wl.kind = 'hold'
  AND wl.user_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
    UNION
    SELECT unnest(ARRAY[
      '3d5522b3-aedf-4625-80a1-8a79708bb893',
      '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
      '7003532b-1bba-4bbe-8b7e-b89e86051169'
    ]::text[])
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallet_ledger rel
    WHERE rel.ride_booking_id = wl.ride_booking_id
      AND rel.kind = 'release'
  )
ORDER BY wl.created_at DESC;


-- ── 2) Fix — cancel open rides + release holds + sync wallets ────────────────

BEGIN;

UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'test_release_wallet_holds',
    updated_at = now()
WHERE buyer_id::text IN (
  SELECT id::text FROM public.users
  WHERE phone LIKE '%4151816902%'
     OR phone IN ('524151816902', '+524151816902', '5214151816902')
  UNION
  SELECT unnest(ARRAY[
    '3d5522b3-aedf-4625-80a1-8a79708bb893',
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ]::text[])
)
  AND status IN ('requested', 'matched', 'accepted', 'arrived', 'in_trip');

INSERT INTO public.wallet_ledger (user_id, kind, amount_mxn_cents, ride_booking_id, meta)
SELECT wl.user_id,
       'release',
       wl.amount_mxn_cents,
       wl.ride_booking_id,
       '{"reason":"test_release_wallet_holds"}'::jsonb
FROM public.wallet_ledger wl
WHERE wl.kind = 'hold'
  AND wl.user_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
    UNION
    SELECT unnest(ARRAY[
      '3d5522b3-aedf-4625-80a1-8a79708bb893',
      '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
      '7003532b-1bba-4bbe-8b7e-b89e86051169'
    ]::text[])
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallet_ledger rel
    WHERE rel.ride_booking_id = wl.ride_booking_id
      AND rel.kind = 'release'
  );

WITH phone_users AS (
  SELECT id::text AS user_id
  FROM public.users
  WHERE phone LIKE '%4151816902%'
     OR phone IN ('524151816902', '+524151816902', '5214151816902')
  UNION
  SELECT unnest(ARRAY[
    '3d5522b3-aedf-4625-80a1-8a79708bb893',
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ]::text[])
),
held AS (
  SELECT user_id, COALESCE(SUM(amount_mxn_cents), 0) AS held_cents
  FROM public.wallet_ledger
  WHERE kind = 'hold'
    AND ride_booking_id IS NOT NULL
    AND user_id IN (SELECT user_id FROM phone_users)
    AND ride_booking_id NOT IN (
      SELECT ride_booking_id
      FROM public.wallet_ledger
      WHERE kind = 'release'
        AND ride_booking_id IS NOT NULL
    )
  GROUP BY user_id
),
balance AS (
  SELECT user_id,
         COALESCE(SUM(
           CASE kind
             WHEN 'load' THEN amount_mxn_cents
             WHEN 'load_bonus' THEN amount_mxn_cents
             WHEN 'release' THEN amount_mxn_cents
             WHEN 'refund' THEN amount_mxn_cents
             WHEN 'hold' THEN -amount_mxn_cents
             WHEN 'capture' THEN amount_mxn_cents
             WHEN 'payout_debit' THEN -amount_mxn_cents
             WHEN 'adjustment' THEN amount_mxn_cents
             ELSE 0
           END
         ), 0) AS balance_cents
  FROM public.wallet_ledger
  WHERE user_id IN (SELECT user_id FROM phone_users)
  GROUP BY user_id
),
targets AS (
  SELECT user_id FROM phone_users
  WHERE user_id IN (SELECT user_id FROM balance)
     OR user_id IN (SELECT user_id FROM held)
     OR user_id IN (SELECT user_id FROM public.wallets)
)
UPDATE public.wallets w
SET balance_mxn_cents = GREATEST(0, COALESCE(b.balance_cents, 0)),
    held_mxn_cents = GREATEST(0, COALESCE(h.held_cents, 0)),
    version = w.version + 1,
    updated_at = now()
FROM targets t
LEFT JOIN balance b ON b.user_id = t.user_id
LEFT JOIN held h ON h.user_id = t.user_id
WHERE w.user_id = t.user_id;

INSERT INTO public.wallets (user_id, balance_mxn_cents, held_mxn_cents, version, updated_at)
SELECT b.user_id,
       GREATEST(0, b.balance_cents),
       GREATEST(0, COALESCE(h.held_cents, 0)),
       0,
       now()
FROM (
  SELECT user_id,
         COALESCE(SUM(
           CASE kind
             WHEN 'load' THEN amount_mxn_cents
             WHEN 'load_bonus' THEN amount_mxn_cents
             WHEN 'release' THEN amount_mxn_cents
             WHEN 'refund' THEN amount_mxn_cents
             WHEN 'hold' THEN -amount_mxn_cents
             WHEN 'capture' THEN amount_mxn_cents
             WHEN 'payout_debit' THEN -amount_mxn_cents
             WHEN 'adjustment' THEN amount_mxn_cents
             ELSE 0
           END
         ), 0) AS balance_cents
  FROM public.wallet_ledger
  WHERE user_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
    UNION
    SELECT unnest(ARRAY[
      '3d5522b3-aedf-4625-80a1-8a79708bb893',
      '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
      '7003532b-1bba-4bbe-8b7e-b89e86051169'
    ]::text[])
  )
  GROUP BY user_id
) b
LEFT JOIN (
  SELECT user_id, COALESCE(SUM(amount_mxn_cents), 0) AS held_cents
  FROM public.wallet_ledger
  WHERE kind = 'hold'
    AND ride_booking_id IS NOT NULL
    AND ride_booking_id NOT IN (
      SELECT ride_booking_id FROM public.wallet_ledger WHERE kind = 'release' AND ride_booking_id IS NOT NULL
    )
  GROUP BY user_id
) h ON h.user_id = b.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = b.user_id)
ON CONFLICT (user_id) DO NOTHING;

COMMIT;


-- ── 3) AFTER — refresh /saldo in the app ─────────────────────────────────────

SELECT 'AFTER wallet' AS step,
       w.user_id,
       round(w.balance_mxn_cents / 100.0, 2) AS balance_mxn,
       round(w.held_mxn_cents / 100.0, 2) AS held_mxn,
       round((w.balance_mxn_cents + w.held_mxn_cents) / 100.0, 2) AS total_mxn
FROM public.wallets w
WHERE w.user_id IN (
  SELECT id::text FROM public.users
  WHERE phone LIKE '%4151816902%'
     OR phone IN ('524151816902', '+524151816902', '5214151816902')
  UNION
  SELECT unnest(ARRAY[
    '3d5522b3-aedf-4625-80a1-8a79708bb893',
    '94a74ff0-d2f4-46a7-b43e-85fb8f2cf524',
    '7003532b-1bba-4bbe-8b7e-b89e86051169'
  ]::text[])
)
ORDER BY total_mxn DESC;

SELECT 'AFTER unreleased holds (expect n = 0)' AS step,
       count(*)::int AS n
FROM public.wallet_ledger wl
WHERE wl.kind = 'hold'
  AND wl.user_id IN (
    SELECT id::text FROM public.users
    WHERE phone LIKE '%4151816902%'
       OR phone IN ('524151816902', '+524151816902', '5214151816902')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_ledger rel
    WHERE rel.ride_booking_id = wl.ride_booking_id AND rel.kind = 'release'
  );
