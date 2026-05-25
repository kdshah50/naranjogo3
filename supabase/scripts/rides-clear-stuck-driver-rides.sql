-- Clear stuck ride_bookings that block dispatch ("driver blocked by active ride_booking").
-- Run in Supabase SQL Editor on preview/staging only.
--
-- Typical cause: ride matched in DB but driver never saw it on /conductor/viajes
-- (duplicate phone session). Dispatch treats matched/accepted/arrived/in_trip as busy.
--
-- Driver Carme (adjust IDs if needed):
--   user_id = 3d5522b3-aedf-4625-80a1-8a79708bb893

BEGIN;

-- 1) Inspect stuck rides for this driver
SELECT id, status, ticket_code, driver_id, buyer_id, pickup_address, dropoff_address, matched_at, created_at
FROM public.ride_bookings
WHERE driver_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip')
ORDER BY created_at DESC;

-- 2) Cancel those rides
UPDATE public.ride_bookings
SET status = 'cancelled',
    cancel_reason = 'test_clear_busy',
    updated_at = now()
WHERE driver_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
  AND status IN ('matched', 'accepted', 'arrived', 'in_trip');

-- 3) Release wallet holds for rides we just cancelled (buyer saldo)
INSERT INTO public.wallet_ledger (user_id, kind, amount_mxn_cents, ride_booking_id, meta)
SELECT wl.user_id,
       'release',
       wl.amount_mxn_cents,
       wl.ride_booking_id,
       '{"reason":"test_clear_busy"}'::jsonb
FROM public.wallet_ledger wl
JOIN public.ride_bookings rb ON rb.id = wl.ride_booking_id
WHERE rb.cancel_reason = 'test_clear_busy'
  AND wl.kind = 'hold'
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallet_ledger rel
    WHERE rel.ride_booking_id = wl.ride_booking_id
      AND rel.kind = 'release'
  );

-- 4) Sync wallets.balance / wallets.held from ledger (per buyer with a release above)
WITH released AS (
  SELECT wl.user_id, SUM(wl.amount_mxn_cents) AS released_cents
  FROM public.wallet_ledger wl
  JOIN public.ride_bookings rb ON rb.id = wl.ride_booking_id
  WHERE rb.cancel_reason = 'test_clear_busy'
    AND wl.kind = 'release'
  GROUP BY wl.user_id
),
held AS (
  SELECT user_id, COALESCE(SUM(amount_mxn_cents), 0) AS held_cents
  FROM public.wallet_ledger
  WHERE kind = 'hold'
    AND ride_booking_id IS NOT NULL
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
             WHEN 'capture' THEN -amount_mxn_cents
             WHEN 'payout_debit' THEN -amount_mxn_cents
             WHEN 'adjustment' THEN amount_mxn_cents
             ELSE 0
           END
         ), 0) AS balance_cents
  FROM public.wallet_ledger
  GROUP BY user_id
)
UPDATE public.wallets w
SET balance_mxn_cents = GREATEST(0, COALESCE(b.balance_cents, 0)),
    held_mxn_cents = GREATEST(0, COALESCE(h.held_cents, 0)),
    version = w.version + 1,
    updated_at = now()
FROM released r
LEFT JOIN balance b ON b.user_id = r.user_id
LEFT JOIN held h ON h.user_id = r.user_id
WHERE w.user_id = r.user_id;

-- 5) Verify driver is free
SELECT id, status, ticket_code, driver_id, cancel_reason
FROM public.ride_bookings
WHERE driver_id::text = '3d5522b3-aedf-4625-80a1-8a79708bb893'
ORDER BY created_at DESC
LIMIT 5;

COMMIT;
