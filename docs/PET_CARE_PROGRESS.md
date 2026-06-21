# Pet Care Services — Progress Log

Mirror format of `docs/VETERINARY_PROGRESS.md` and `docs/HOUSEKEEPING_PROGRESS.md`.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `pet-care-service` (synced from `main` Jun 2026) |
| Slugs | `paseador`, `pet_sitting`, `estetica_canina` |
| Latest step | **Full quote gate + balance/tip after complete (parity with vet/housekeeping)** |
| Landing | `/cuidado-mascotas` |
| Next step | Preview smoke test for all three slugs |

---

## Same flow as vet / housekeeping

| Step | Pet care |
|------|----------|
| Signup | `/unete?service=paseador` (or `pet_sitting`, `estetica_canina`) + menu template |
| Buyer request | Contact form + menu picker → **Enviar solicitud al proveedor** |
| Provider quote | **Enviar cotización al cliente** (green — not «Enviar al chat») |
| Buyer | **Aceptar / Rechazar** → pay deposit |
| Lifecycle | Agendado → En progreso → Completado |
| After complete | Pay **balance** + optional **tip** in Mis reservas (Stripe Connect) |

**Only difference:** starter menu items and prices per slug (see `lib/listing-service-menu.ts`).

---

## Menus (`lib/listing-service-menu.ts`)

- `dogWalkingStarterMenu()` — slug `paseador` (~12 items)
- `petSittingStarterMenu()` — slug `pet_sitting` (~12 items)
- `dogGroomingStarterMenu()` — slug `estetica_canina` (~14 items)
- `petCareLandingSampleMenu()` — landing page preview mix

---

## Smoke test checklist

1. `/cuidado-mascotas` → signup as **paseador** → admin approve listing
2. Buyer: contact + request → provider **Enviar cotización al cliente**
3. Buyer: Accept → deposit → NG ticket
4. Provider: schedule → in progress → **Completado**
5. Buyer: pay balance (+ optional tip) in Mis reservas
6. Repeat steps 1–5 for `pet_sitting` and `estetica_canina`

---

## Migrations

No new DB tables. Reuses quote gate + balance columns (already on Supabase prod).
