# Veterinary Services MVP — Progress Log

A running log of what's built, what's deployed, and how to verify each step.
Mirror format of `docs/TAILORING_PROGRESS.md`. Keep updating after every step.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `veterinary-service` (forked from `main`) |
| Strategy | Additive: reuse existing `service_menu` jsonb on `listings`, enable menu editor for slug `veterinaria` in `/unete`, add a veterinary starter template + disclaimer. **Zero changes to sell/buy `SellModal`, booking, cart, payment, or webhook code.** |
| Master kill-switch | Menu editor only renders for slugs in `PROVIDER_SERVICES_WITH_MENU`. Until `veterinaria` is added to that set, vet signup behaves exactly like any other service on `main`. |
| Latest step completed | **Phase V2 — `/veterinaria` landing page (links to `/unete?service=veterinaria`)** |
| Next step | Deploy preview + full smoke test (landing → signup → listing → chat quote) |

---

## Architectural decision

**Veterinary is added through the dedicated service-provider onboarding flow at `/unete`, NOT through the general "+ Vender" (SellModal) button.**

Same model as tailoring (`arreglos_de_ropa`):

- The sell/buy flow (`SellModal` → `POST /api/listings`) stays **unchanged**.
- The service-provider flow (`/unete` → `POST /api/provider-signup`) gains a **"Menú de servicios (precios fijos)"** editor when the selected primary service is **`veterinaria`**.
- Other providers (plumber, tailor, taxi, etc.) see **no change** in `/unete`.
- The listing row carries the menu in **`listings.service_menu`** (jsonb, nullable). Public listing + in-chat quote builder reuse existing components.

**Existing slug:** `veterinaria` is already in `PROVIDER_SERVICES` (`lib/provider-services.ts`). Phase V1 only wires the **menu vertical** — not a new signup category.

**Related pet slugs (unchanged in V1):** `paseador`, `pet_sitting`, `estetica_canina` remain separate simple signups without menus unless we expand later.

---

## Decision log

- **Reuse tailoring infrastructure.** `lib/listing-service-menu.ts`, `ServiceMenuPublic`, `ServiceMenuQuoteBuilder`, `POST /api/provider-signup` (`service_menu` field), `PATCH /api/listings/[id]` — all exist on `main`. Veterinary adds a starter template + slug gate only.
- **Reuse existing buyer/seller flows.** Chat → agreed price → Stripe Checkout (commission + IVA) → wa.me unlock. Quote builder total flows into `listing_service_contact_gate.agreed_subtotal_mxn_cents`.
- **No new tables.** Same `service_menu` jsonb column (migration `20260518150000_listings_service_menu.sql` already on `main`).
- **No new Stripe primitives.**
- **Vet-specific disclaimer (not garment inspection).** Default copy: price may change after physical exam / assessment. Separate constants from tailoring's "revisar la prenda físicamente."
- **WhatsApp interactive bot deferred to Phase V3** (same as tailoring) — only after real vet bookings validate demand.
- **No diagnosis or prescription UX in V1.** Menu items are **published service prices** (consultation, vaccines, etc.). Medical disclaimers on listing + quote only; not a telemedicine product.

---

## Phase V1 — Menu MVP (target: 1–2 days)

### Goal

A vet clinic or mobile vet can sign up at `/unete`, publish a **fixed-price service menu**, and use the **in-chat quote builder** like a tailor.

### Database

- **No new migration** if `listings.service_menu` already exists on the Supabase project (from tailoring migration). Verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'service_menu';
```

### Library (`lib/listing-service-menu.ts`)

- [ ] Add `DEFAULT_VET_DISCLAIMER_ES` / `DEFAULT_VET_DISCLAIMER_EN`
- [ ] Add `veterinaryStarterMenu(): ServiceMenu` — suggested items below (editable before publish)
- [ ] Export helper `starterMenuForProviderSlug(slug)` or branch in `/unete` (tailor vs vet template)

### Provider catalog (`lib/provider-services.ts`)

- [ ] Add `"veterinaria"` to `PROVIDER_SERVICES_WITH_MENU`
- [ ] `providerServiceSupportsMenu("veterinaria")` → `true`

### Server / API

- **No API route changes expected** — `provider-signup` and `listings/[id]` PATCH already accept `service_menu` when slug supports menu.

### UI

- [ ] `app/unete/page.tsx` — when primary service is `veterinaria`:
  - Show same menu editor as tailoring (name + price rows, add/remove, max items)
  - **"Cargar plantilla sugerida"** loads `veterinaryStarterMenu()` (not tailoring template)
  - Vet disclaimer in yellow info box (ES/EN)
- [ ] `components/ServiceMenuPublic.tsx` — already generic; shows vet menu + disclaimer on listing page
- [ ] `components/ServiceMenuQuoteBuilder.tsx` — already generic; seller builds quote from menu in chat
- [ ] `components/SellModal.tsx` — **untouched**
- [ ] `app/listing/[id]/page.tsx` — already forwards `service_menu` to public + chat

### Suggested starter menu (Mexico, clinic / neighborhood tier — mid-range pesos)

| SKU | ES | EN | Indicative price (MXN) |
|-----|----|----|------------------------|
| `consult_general` | Consulta general (perro/gato) | General exam (dog/cat) | $350 |
| `consult_puppy` | Consulta cachorro / kitten | Puppy/kitten exam | $400 |
| `consult_followup` | Consulta de seguimiento | Follow-up visit | $250 |
| `vaccine_rabies_dog` | Vacuna antirrábica (perro) | Rabies vaccine (dog) | $280 |
| `vaccine_rabies_cat` | Vacuna antirrábica (gato) | Rabies vaccine (cat) | $280 |
| `vaccine_quintuple` | Vacuna múltiple perro (quintuple) | Dog multivalent vaccine | $450 |
| `vaccine_triple_felina` | Vacuna triple felina | Feline triple vaccine | $420 |
| `deworm_oral` | Desparasitación oral | Oral deworming | $180 |
| `deworm_inject` | Desparasitación inyectable | Injectable deworming | $220 |
| `nail_trim` | Corte de uñas | Nail trim | $120 |
| `ear_clean` | Limpieza de oídos | Ear cleaning | $150 |
| `chip_id` | Microchip + registro | Microchip + registration | $650 |
| `blood_panel_basic` | Química sanguínea básica | Basic blood panel | $900 |
| `urinalysis` | Examen general de orina | Urinalysis | $350 |
| `fluid_subq` | Fluidos subcutáneos | Subcutaneous fluids | $400 |
| `home_visit_fee` | Visita a domicilio (dentro de zona) | Home visit (in zone) | $300 |
| `emergency_surcharge` | Urgencia fuera de horario | After-hours emergency surcharge | $500 |
| `cert_travel` | Certificado de salud para viaje | Travel health certificate | $550 |
| `euthanasia_consult` | Consulta valoración eutanasia | Euthanasia consultation | $600 |

*Prices are starting suggestions — vets edit before publishing. Final quote still goes through agreed price + checkout.*

### Vet disclaimer (default)

- **ES:** `El precio puede ajustarse después del examen físico y según el peso, edad o condición del paciente.`
- **EN:** `Price may change after physical exam and depending on the patient's weight, age, or condition.`

---

## What to ship checklist (Phase V1)

Copy this block into the PR description when V1 is done:

### Database

- [ ] Confirm `service_menu` column exists (no new migration, or document if prod lagging)

### Library

- [ ] `veterinaryStarterMenu()` + vet disclaimers in `lib/listing-service-menu.ts`
- [ ] `veterinaria` in `PROVIDER_SERVICES_WITH_MENU`

### UI

- [ ] `/unete` menu editor + vet template button + disclaimer
- [ ] Zero regression: other services + SellModal unchanged

### Reused unchanged (tailoring model)

- `components/ServiceMenuPublic.tsx`
- `components/ServiceMenuQuoteBuilder.tsx`
- `components/ListingChat.tsx` (quote builder mount)
- `app/api/provider-signup/route.tsx` (`service_menu` validation)
- `app/api/listings/[id]/route.ts` (PATCH menu)

---

## How to verify (smoke test) once preview is up

### A. Confirm database (one-time)

Run in Supabase SQL Editor if column missing:

```sql
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS service_menu JSONB;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_service_menu_shape_chk;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_service_menu_shape_chk
  CHECK (
    service_menu IS NULL
    OR (
      jsonb_typeof(service_menu) = 'object'
      AND jsonb_typeof(service_menu -> 'items') = 'array'
    )
  );
```

### B. Test vet signup (`/unete`)

1. Open Vercel preview for `veterinary-service`.
2. Go to `/unete`.
3. Step 1: name, WhatsApp, etc. → Continue.
4. Step 2: choose **"Servicios veterinarios"** / **"Veterinary Services"**.
5. Yellow card **"Menú de servicios (precios fijos)"** must appear (only for `veterinaria`, not for Plomero).
6. Click **"Cargar plantilla sugerida"** → ~19 vet rows pre-fill with ES names and pesos.
7. Edit/delete rows; confirm vet disclaimer visible.
8. Complete steps 3–4 and submit.
9. Admin sets `is_verified = true` on the listing.

### C. Test public listing

1. Open published vet listing.
2. **"Menú de servicios"** card lists items + prices + vet disclaimer.

### D. Test seller-in-chat quote builder

1. Buyer messages the vet listing.
2. Vet opens chat → amber **"Precio acordado del trabajo"** box → **"Arma un presupuesto desde tu menú"**.
3. Add items (e.g. consult + rabies vaccine) → subtotal updates.
4. **Aplicar al precio acordado** → **Guardar** → **Enviar al chat** (optional).

### E. Zero regression

1. **SellModal** — no menu editor for any category.
2. **`/unete`** with Plomero / Arreglos de ropa — tailor template only for tailoring; vet template only for veterinaria; no cross-contamination.
3. Existing listings without menus unchanged.

---

## Phase V2 — Veterinary vertical landing + onboarding (2–3 days after V1)

When V1 is deployed and smoke-tested:

- [ ] `/veterinaria` (or `/servicios-veterinarios`) landing page — markets the vertical, links to `/unete?service=veterinaria` (pre-select slug from query param if not already supported).
- [ ] Optional: filter/browse “Veterinary” on marketplace services category.
- [ ] Recruit 3–5 local vets (San Miguel / nearby) via Marketplace / Facebook / referrals.
- [ ] Optional signup extras (not in V1): species served (perro/gato/exóticos), clinic vs domicilio (may overlap with existing `service_location` in provider meta).

## Phase V3 — WhatsApp interactive bot (deferred)

Same deferral as tailoring — only if Phase V2 produces real bookings:

- Inbound Twilio webhook, session store, list-message templates for “pick services from menu.”
- Estimated 1–2 weeks; build only after demand signal.

---

## Rollback plan

Entire feature is additive (NULL-default column + slug check):

1. **Hide UI without DB change:**
   ```bash
   git checkout main -- lib/provider-services.ts app/unete/page.tsx lib/listing-service-menu.ts
   git push
   ```
   Listings that already have vet menus keep rendering publicly until cleared.

2. **Remove menu from a single listing:**
   ```sql
   UPDATE public.listings SET service_menu = NULL WHERE id = '<listing-uuid>';
   ```

3. **Drop column** (only if no listing uses menus — affects tailoring too):
   ```sql
   ALTER TABLE public.listings DROP COLUMN IF EXISTS service_menu;
   ```

Production (`main` + naranjogo.com.mx) is **not affected** while work stays on `veterinary-service` until merge.

---

## File map (tailoring model → veterinary)

| Tailoring | Veterinary (Phase V1) |
|-----------|------------------------|
| Slug `arreglos_de_ropa` | Slug `veterinaria` (already in catalog) |
| `tailoringStarterMenu()` | `veterinaryStarterMenu()` *(to add)* |
| `PROVIDER_SERVICES_WITH_MENU` | Add `veterinaria` |
| Garment inspection disclaimer | Physical exam / patient disclaimer |
| `/arreglos-de-ropa` landing (T2) | `/veterinaria` landing (V2) |
| Branch `tailoring-mvp` | Branch `veterinary-service` |

---

## Commands

```bash
# Confirm branch
git branch --show-current   # → veterinary-service

# After V1 implementation
git add lib/listing-service-menu.ts lib/provider-services.ts app/unete/page.tsx
git commit -m "Vet menu MVP: veterinaria slug + starter template in /unete"
git push -u origin veterinary-service
```

Preview URL pattern (Vercel):  
`https://naranjogo3-git-veterinary-service-<team>.vercel.app`

---

*Last updated: planning doc created on `veterinary-service`. Update after Phase V1 code merge and first preview smoke test.*
