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
| Latest step completed | **Phase H2 — `/limpieza-del-hogar` landing page** |
| Next step | Deploy preview + smoke test (landing → signup → listing → chat quote) |

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
- **Recurring** — weekly / biweekly visit rows (reference prices).

Every row is **editable or deletable** at signup. Final total always flows through chat + agreed price disclaimer.

---

## Phase H1 — shipped on branch

- [x] `limpieza` in `PROVIDER_SERVICES_WITH_MENU`
- [x] `housekeepingStarterMenu()` — 34 reference items (Mexico neighborhood tier, SMA)
- [x] Housekeeping disclaimers (home condition / access)
- [x] `/unete` — template button, ES/EN copy for `limpieza`
- [x] Search trade hints — deep clean, mudanza, lavado ropa, etc.

## Phase H2 — landing (shipped on branch)

- [x] `/limpieza-del-hogar` landing → `/unete?service=limpieza`
- [x] Buyer CTA → `/?category=services&q=limpieza`
- [x] TrustBar footer link (alongside tailoring)

## Later (deferred)

- [ ] Seller dashboard UI to edit `service_menu` after signup (API PATCH exists)
- [ ] Optional room-calculator widget (qty × room type) — today quote builder in chat is enough

## Phase H3 — WhatsApp bot (deferred)

Only after real booking demand.

---

## Smoke test (after deploy)

1. `/limpieza-del-hogar` — ES/EN, sample 34-item menu, Registrarme CTA
2. `/unete?service=limpieza&lang=es` — primary service = Limpieza del hogar
3. Load template (34 services) — edit prices, remove rows, add custom row
4. Submit → admin approve → public menu + chat quote builder
5. `/?category=services&q=limpieza+profunda` — hybrid search finds listing
6. Regression: tailoring + veterinary templates unchanged

---

## Rollback

Remove `limpieza` from `PROVIDER_SERVICES_WITH_MENU` and redeploy — listings with menus keep data until cleared.
