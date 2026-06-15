# Pet Care Services — Progress Log

Mirror format of `docs/VETERINARY_PROGRESS.md` and `docs/HOUSEKEEPING_PROGRESS.md`.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `housekeeping-service` (additive with vet quote gate) |
| Slugs | `paseador`, `pet_sitting`, `estetica_canina` |
| Latest step | **Full pet care quote gate + menus + `/cuidado-mascotas` landing** |
| Balance/tip after complete | Housekeeping only (unchanged) |

---

## What's built

### Provider catalog (`lib/provider-services.ts`)
- `PET_WALKING_SERVICE`, `PET_SITTING_SERVICE`, `DOG_GROOMING_SERVICE`
- All three in `PROVIDER_SERVICES_WITH_MENU` and `PROVIDER_SERVICES_WITH_QUOTE_ACCEPT`

### Menus (`lib/listing-service-menu.ts`)
- `dogWalkingStarterMenu()` — 12 items
- `petSittingStarterMenu()` — 12 items
- `dogGroomingStarterMenu()` — 14 items
- `petCareLandingSampleMenu()` — landing page preview

### Quote flow (same as housekeeping/vet)
1. Buyer fills **contact form** + menu request → `POST .../quote/request`
2. Provider sends official quote → `POST .../quote/send`
3. Buyer accepts → deposit checkout
4. Lifecycle + WhatsApp (generic seller/buyer phase notify)

### UI / landings
- `/cuidado-mascotas` — provider landing with three signup CTAs
- Hero chips: Limpieza, Veterinaria, Cuidado de mascotas
- `ServiceMenuQuoteBuilder` — contact form for all quote-gated slugs
- Vertical copy in `lib/service-quote-vertical.ts`

### Únete
- `getServiceMenuEditorCopy()` hints + templates per pet slug

---

## Smoke test checklist

1. `/cuidado-mascotas` → signup as paseador → listing with menu
2. Buyer: contact form + request → provider WhatsApp
3. Provider: send quote → buyer accept → deposit
4. Repeat for `pet_sitting` and `estetica_canina`
5. `/veterinaria` → same quote flow (no visit frequency)

---

## Migrations

No new DB tables. Reuses H4 quote gate migration (`20260605120000_service_quote_gate.sql`) if not already applied.
