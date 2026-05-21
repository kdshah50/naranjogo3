# Phase 4 — Trip lifecycle + wallet hold/capture

Test on Vercel preview after Phase 2+3 migration **and** Phase 4 migration.

## Migration

Run in Supabase SQL Editor:

`supabase/migrations/20260523120000_rides_phase4_driver_online.sql`

Adds `is_online`, `last_lat`, `last_lng` on `driver_profiles`.

## Golden path (web)

| # | Actor | Action | Expected |
|---|--------|--------|----------|
| 1 | Buyer | `/saldo` — confirm balance ≥ hold (~1.5× fare) | `balance_mxn_cents` OK |
| 2 | Driver | `/conductor/viajes` → **Conectar** | `is_online=true` |
| 3 | Buyer | `/viaje` → pedir taxi | `status=matched`, ticket code |
| 4 | Supabase | `wallet_ledger` | `kind=hold` for ride; `wallets.held` increased |
| 5 | Driver | **Aceptar** → **Llegué** → enter ticket → **Iniciar** | `in_trip` |
| 6 | Driver | **Completar viaje** | `completed`; ledger `release` + `capture` + driver `adjustment` |
| 7 | Buyer | Optional propina on `/viaje` | tip ledger entries |
| 8 | Buyer | `/saldo` | balance reduced by fare (+ tip if any) |

## Cancel path

- Buyer cancels within 2 min of match → hold released, no fee.
- After 2 min → `$30 MXN` cancel fee (`capture_kind=cancel_fee`) if hold was placed.

## Driver must be online

Dispatch prefers `is_online=true`. If none online, system falls back to all active drivers (preview convenience).

## APIs

```
POST /api/rides/[id]/accept
POST /api/rides/[id]/arrive
POST /api/rides/[id]/start   { "ticket_code": "NG-XXXXXXXX" }
POST /api/rides/[id]/complete   { "final_total_mxn_cents": 4500 }  // optional
POST /api/rides/[id]/cancel
POST /api/rides/[id]/tip   { "tip_mxn": 20 }
POST /api/rides/drivers/me/online   { "online": true, "lat": 20.91, "lng": -100.74 }
GET  /api/rides/active
GET  /api/rides/drivers/me/trips
```

## Unit tests

```bash
npm run test:ride-lifecycle
npm run test:ride-pricing
```
