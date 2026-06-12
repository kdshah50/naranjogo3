# Housekeeping / Home Cleaning MVP — Progress Log

Mirror format of `docs/TAILORING_PROGRESS.md` and `docs/VETERINARY_PROGRESS.md`.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `housekeeping-service` (forked from `veterinary-service`) |
| Strategy | Additive: reuse `listings.service_menu` jsonb, enable menu editor for slug `limpieza` in `/unete`, add housekeeping starter template + disclaimer. **Zero changes to SellModal, booking, cart, payment, or webhook code.** |
| Master kill-switch | Menu editor only renders for slugs in `PROVIDER_SERVICES_WITH_MENU`. Until `limpieza` is added, housekeeping signup behaves like any other service on `main`. |
| Existing slug | `limpieza` — "Limpieza del hogar" / "House Cleaning" (already in `PROVIDER_SERVICES`) |
| Latest step completed | **Later phase — profile menu editor + housekeeping quick quote** |
| Next step | Deploy preview + smoke test (profile menu edit, chat quick quote) |

---

## Architectural decision

Same model as tailoring and veterinary:

| Layer | Housekeeping |
|-------|--------------|
| Signup | `/unete?service=limpieza` → menu editor + optional template |
| Storage | `listings.service_menu` jsonb (nullable) |
| Public | `ServiceMenuPublic` on listing page |
| Quote | `ServiceMenuQuoteBuilder` in seller chat → agreed price |
| Payment | Existing `ServiceBookingBlock` — commission only or full Connect |
| Search | Hybrid `/api/search` + trade hints for limpieza / deep clean |

**No new tables. No new Stripe flows. No SellModal changes.**

---

## Menu design philosophy

The starter template uses **line-item pricing** (not a calculator UI):

- **Standard vs deep** — separate rows per room type so sellers can quote "2 recámaras estándar + 1 baño profundo" in chat.
- **Room types** — recámara, baño, cocina, sala/comedor, family room, otro cuarto.
- **Add-ons** — laundry, ironing, windows, appliances, move-out, pets.
- **Recurring** — menu prices are **per visit**; seller picks **per visit** or **monthly package** (× frequency) for agreed price

Every row is **editable or deletable** at signup. Final total always flows through chat + agreed price disclaimer.

---

## Phase H1 — shipped on branch

- [x] `limpieza` in `PROVIDER_SERVICES_WITH_MENU`
- [x] `housekeepingStarterMenu()` — 32 reference items (Mexico neighborhood tier, SMA)
- [x] Housekeeping disclaimers (home condition / access)
- [x] `/unete` — template button, ES/EN copy for `limpieza`
- [x] Search trade hints — deep clean, mudanza, lavado ropa, etc.

## Phase H2 — landing (shipped on branch)

- [x] `/limpieza-del-hogar` landing → `/unete?service=limpieza`
- [x] Buyer CTA → `/?category=services&q=limpieza`
- [x] TrustBar footer link (alongside tailoring)

## Later — shipped on branch

- [x] **`/profile/listing/[id]/menu`** — seller edits `service_menu` after signup (owner auth, PATCH API)
- [x] **`ServiceMenuEditor`** — shared component used by `/unete` and profile menu page
- [x] **Housekeeping quick quote** — room-type qty picks + **visit frequency** (one-time, daily, weekly, 2×/week, monthly) in `ServiceMenuQuoteBuilder`
- [x] Profile **Editar menú** link on menu-enabled listings
- [x] `lib/infer-listing-provider-slug.ts` — infer slug from listing title for templates + quote layout

## Phase H4 — gated quote + deposit (shipped on branch)

- [x] Migration `20260605120000_service_quote_gate.sql` — `quote_status`, line items, metadata on contact gate
- [x] Buyer **cleaning request** panel (menu picker + notes) → chat + WhatsApp to provider
- [x] Seller **Enviar cotización al cliente** → `pending` quote + WhatsApp deep link `?quote=1`
- [x] Buyer **Accept / Decline** → blocks deposit until accepted
- [x] Checkout gated: `commission_only` deposit only after `quote_status = accepted` (limpieza only)
- [x] APIs: `GET/POST .../service-booking/quote/*` (send, request, respond)

## Phase H3 — WhatsApp bot (deferred)

Only after real booking demand.

---

## Smoke test (after deploy)

1. `/limpieza-del-hogar` — ES/EN, sample 32-item menu, Registrarme CTA
2. `/unete?service=limpieza&lang=es` — primary service = Limpieza del hogar
3. Load template (32 services) — edit prices, remove rows, add custom row
4. Submit → admin approve → public menu + chat quote builder
5. `/?category=services&q=limpieza+profunda` — hybrid search finds listing
6. Regression: tailoring + veterinary templates unchanged
7. `/profile` → **Editar menú** on a limpieza listing → change prices → save → public menu updates
8. Seller chat on limpieza listing → pick **Frecuencia de visitas** (e.g. weekly) → verify monthly total = per-visit × visits/month

---

## Rollback

Remove `limpieza` from `PROVIDER_SERVICES_WITH_MENU` and redeploy — listings with menus keep data until cleared.
