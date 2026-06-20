# Phase 2 + 3 — Preview test checklist

Run on Vercel preview (`rides-setup`) with `RIDES_ENABLED=true`.

## Before testing

1. **Run Supabase migration** — paste `supabase/migrations/20260522120000_rides_bookings_foundation.sql` in SQL Editor.
2. **Vercel env (Preview)**:
   - `RIDES_ENABLED=true`
   - `RIDES_WHATSAPP_INBOUND_ENABLED=true` (for Twilio webhook only)
   - `INTERNAL_API_SECRET` — same value if you deploy `ride-ai/` later
3. **Approved driver** in pickup colonia (from Phase 1):
   ```sql
   -- driver must serve pickup colonia in service_colonias
   SELECT user_id, is_active_driver, service_colonias FROM driver_profiles WHERE is_active_driver = true;
   ```
4. **Buyer saldo** — load via `/saldo`; at match, hold moves balance → `held`.

## Phase 3 — Web (`/viaje`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log in on preview | Session cookie set |
| 2 | Open `/viaje` | Form loads |
| 3 | Pick centro → guadalupe, **Ver tarifa** | Estimate JSON, ~$45+ MXN |
| 4 | **Pedir taxi** | `ride_bookings` row `status=matched`, `ticket_code` set |
| 5 | Supabase | `ride_events` has `ride_requested` + `driver_matched` |
| 6 | WhatsApp (optional) | Buyer + driver get Twilio messages if numbers configured |

## Phase 2 — WhatsApp (Twilio sandbox)

1. Twilio Console → WhatsApp sandbox → **When a message comes in**:
   `https://YOUR-PREVIEW.vercel.app/api/rides/whatsapp/inbound`
2. From a phone linked to your NaranjoGo user, send:
   `taxi de centro a guadalupe`
3. Expect TwiML reply with fare + ticket if driver available.

## API smoke (curl)

Replace `SECRET`, `PREVIEW`, and session cookie as needed.

```bash
# Estimate (logged-in cookie or internal secret)
curl -s -X POST "$PREVIEW/api/rides/pricing/estimate" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $SECRET" \
  -d '{"pickup_colonia":"centro","dropoff_colonia":"guadalupe"}'

# Nearby drivers (internal only)
curl -s -X POST "$PREVIEW/api/rides/drivers/nearby" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $SECRET" \
  -d '{"pickup_colonia":"centro"}'
```

## Unit tests locally

```bash
npm run test:ride-pricing
```

## Not in Phase 2+3 (see Phase 4)

- Wallet hold/capture → [`RIDES_PHASE4_TEST.md`](./RIDES_PHASE4_TEST.md)
- Driver accept/arrive/start/complete → `/conductor/viajes`
- Meta Cloud API templates (Twilio sandbox is enough for first test)
- Mapbox Matrix / live GPS
