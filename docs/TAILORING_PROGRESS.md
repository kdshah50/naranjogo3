# Tailoring / Dress Alteration MVP — Progress Log

A running log of what's built, what's deployed, and how to verify each step.
Mirror format of `docs/RIDES_PROGRESS.md`. Keep updating after every step.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `tailoring-mvp` (forked from `main`) |
| Strategy | Additive: a new `service_menu` jsonb column on `listings`, a new tailoring service slug in `PROVIDER_SERVICES`, and a menu editor inside the existing `/unete` ("Ofrece tu servicio") onboarding flow. **Zero changes to the sell/buy `SellModal` flow**. |
| Master kill-switch | None needed — the menu editor only renders for service slugs in `PROVIDER_SERVICES_WITH_MENU` (currently just `arreglos_de_ropa`). All other signup flows behave exactly like `main`. |
| Latest step completed | **Phase T1 — code complete on branch, awaiting first deploy + manual test** |
| Next step | Deploy `tailoring-mvp` to Vercel preview, run the smoke test below, then merge to `main` |

---

## Architectural decision

**Tailoring is added through the dedicated service-provider onboarding flow at `/unete`, NOT through the general "+ Vender" (SellModal) button.**

- The sell/buy flow (`SellModal` → `POST /api/listings`) is **byte-for-byte unchanged** from `main`. No new fields, no UI changes.
- The service-provider flow (`/unete` → `POST /api/provider-signup`) gains a new "Service menu" editor that appears **only** when the selected provider service supports a menu (currently: `arreglos_de_ropa`).
- Other service providers (plumber, taxi, cleaner, etc.) see no change in `/unete`.
- The listing row created by `/api/provider-signup` carries the menu in the new `service_menu` JSONB column. The same column powers the public menu render and the in-chat quote builder.

This way: **non-tailor providers see no change. Non-service listings (sell/buy) see no change. Only the tailoring service signup gets the new editor.**

---

## Decision log

- **Reuse existing flows.** Buyer chats with seller in-app → seller sets agreed total → Stripe Checkout (commission + IVA) → wa.me unlock on success. We only **add** a structured menu and a quote builder; we don't touch booking, cart, payment, or webhook code.
- **Stay on Twilio for WhatsApp.** Confirmed by Twilio docs that interactive list/button messages are available via Twilio Content API. No provider migration ever required for this project.
- **No new tables.** A single `service_menu jsonb` column on `listings` carries the menu. Nullable. Existing rows = `NULL` = behavior unchanged.
- **No new Stripe primitives.** The quote builder's total flows into the existing `listing_service_contact_gate.agreed_subtotal_mxn_cents` field. `lib/marketplace-cart-pricing.ts` already calculates commission + IVA from that base for `full_connect` mode.
- **Tailoring service slug is generic.** `PROVIDER_SERVICES_WITH_MENU` is a set, not a hardcoded check. Adding more menu-driven service categories later (cleaning packages, salon services, etc.) is just adding a slug to that set.
- **WhatsApp bot is deferred to Phase T3.** Only build it after real tailor demand validates the MVP.

---

## What shipped in Phase T1

### Database

- `supabase/migrations/20260518150000_listings_service_menu.sql` — adds `service_menu jsonb` column with a lightweight `CHECK` that, if present, the value must be an object with an `items` array. Additive, nullable.

### Library

- `lib/listing-service-menu.ts` — types, validation, sanitization, and `tailoringStarterMenu()` template with 20 mid-of-range Mexican neighborhood-tailor prices.
- `lib/provider-services.ts` — adds the `arreglos_de_ropa` service slug to `PROVIDER_SERVICES`, plus a new `PROVIDER_SERVICES_WITH_MENU` set and a `providerServiceSupportsMenu(slug)` helper.

### Server / API

- `app/api/provider-signup/route.tsx` — accepts an optional `service_menu` field in the signup body. Validated via `parseServiceMenu`. Only honored when the selected service is in `PROVIDER_SERVICES_WITH_MENU`. Persisted as `service_menu` on the created listing row.
- `app/api/listings/[id]/route.ts` — PATCH accepts `service_menu` (owner-only — admin block-list unchanged). Sending `null` or an empty menu clears it. Validated. This is for later editing.
- `app/api/listings/route.ts` — **untouched** (general sell/buy POST has no awareness of menus).

### UI components

- `app/unete/page.tsx` — new menu editor section that appears in step 2 when the selected service supports a menu (currently tailoring). Includes name + price rows, "+ Agregar servicio" button, "Cargar plantilla sugerida" shortcut that loads the 20-item tailoring starter menu, inspection disclaimer, ES/EN translations.
- `components/SellModal.tsx` — **untouched** (sell/buy flow byte-for-byte identical to main).
- `components/ServiceMenuPublic.tsx` — read-only render of the menu on the public listing page (formatted MXN, optional `name_en`, inspection disclaimer). Shows for any service listing that has a menu, regardless of how the listing was created.
- `components/ServiceMenuQuoteBuilder.tsx` — seller-only quote builder embedded inside the existing amber "Precio acordado" box in `ListingChat`. + / − qty controls, running subtotal, two CTAs:
  - **Aplicar al precio acordado** → fills the existing `agreedPesos` input. The seller still clicks "Guardar" to save — preserves the existing review step.
  - **Enviar al chat** → posts a formatted item list with subtotal and disclaimer as a regular chat message the buyer can see.
- `components/ListingChat.tsx` — new `serviceMenu` prop, mounts `ServiceMenuQuoteBuilder` inside the seller's agreed-price panel when present. Refactors message-send into `postMessageBody` so the quote builder and the regular send share one code path.
- `app/listing/[id]/page.tsx` — renders `ServiceMenuPublic` next to the package-promo block on service listings and forwards `service_menu` to `ListingChat`.

### Disclaimer surfacing

The "El precio puede ajustarse al revisar la prenda físicamente." disclaimer appears in:
1. `app/unete/page.tsx` while authoring the menu (tailor signup).
2. `ServiceMenuPublic` on the public listing page (every buyer sees it).
3. `ServiceMenuQuoteBuilder` in the seller's chat panel.
4. The chat message body when seller uses "Enviar al chat".

That's at least two reads before the buyer hits "Pagar" — sufficient for MVP without touching `ServiceBookingBlock`.

---

## How to verify (smoke test) once the preview is up

### A. Run the migration (one-time per Supabase project)

Open Supabase SQL Editor and run:

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

### B. Test the tailor signup (Únete) flow

1. Open the Vercel preview URL for `tailoring-mvp`.
2. Go to `/unete`.
3. Fill step 1 (name, WhatsApp, etc.) → Continue.
4. On step 2 ("Tu servicio"), in the service picker, choose **"Arreglos de ropa / costurería"**.
5. Below the alternate-services and availability fields, a yellow card titled **"Menú de servicios (precios fijos)"** should appear (only for tailoring — not for any other service).
6. Click **"Cargar plantilla sugerida (20 servicios)"** — 20 rows should pre-fill with Spanish names and pesos.
7. Optionally edit / delete some rows.
8. Continue through steps 3 + 4 and submit.
9. Admin approves the listing (`is_verified = true` in Supabase). After that the listing is public.

### C. Test the public listing page

1. Open the published tailoring listing detail page.
2. Below the title/price, you should see a **"Menú de servicios"** card listing every menu item with its price, plus a yellow disclaimer at the bottom.

### D. Test the seller-in-chat quote builder

1. As a buyer (different account), open the listing → send a message to the tailor.
2. Switch to the tailor account → open "Mensajes" or the chat panel for that listing.
3. Click on the buyer's row to open the conversation.
4. In the amber **"Precio acordado del trabajo"** box, you should see **"Arma un presupuesto desde tu menú"** with all menu items.
5. Tap **+** on a few items (e.g. 2× Dobladillo de mezclilla, 1× Botón pegado).
6. The running subtotal updates live.
7. Click **"Aplicar al precio acordado"** → the pesos input gets filled.
8. Click **"Guardar"** → agreed price persists.
9. Optionally click **"Enviar al chat"** → a formatted line-item summary appears as a chat message.

### E. Confirm zero regression on the sell/buy flow

1. As any user, open the "+ Vender" sell modal.
2. Pick category **🔧 Servicios** (or any other category).
3. The new menu editor must **NOT** appear here. The form must look exactly like it did before.
4. Publish a regular service listing without a menu. It should work exactly like before.

### F. Confirm zero regression on other provider signups

1. Go to `/unete`.
2. Pick any service slug **other than** "Arreglos de ropa / costurería" (e.g. Plomero, Limpieza del hogar, Taxi).
3. The new menu editor must **NOT** appear. The form must look exactly like it did before.
4. Continue and submit. The provider-signup flow should work exactly like before.

---

## Phase T2 — Tailoring vertical landing + onboarding (next, 2–3 days)

When T1 has been deployed and smoke-tested:

- A `/arreglos-de-ropa` (or `/tailoring`) landing page that markets the vertical and links into `/unete?service=arreglos_de_ropa` (pre-selecting the slug if the URL carries it).
- Recruit 5–10 tailors via Marketplace / Facebook / friends.

## Phase T3 — WhatsApp interactive bot (deferred, only if T2 validates demand)

- Build `/api/whatsapp/inbound` route that Twilio posts inbound messages to (Twilio Content API + Quick Reply / List message templates).
- Per-phone session store (Redis or a `whatsapp_sessions` table) for cart state.
- Estimated 1–2 weeks; only build if Phase T2 produces real bookings.

---

## Rollback plan

The entire feature is additive and behind a NULL-default column + a service slug check:

1. **Hide the UI** without touching the DB:
   ```bash
   git checkout main -- app/unete/page.tsx lib/provider-services.ts
   git push
   ```
   Result: tailors can't add menus during signup, but listings that already have menus continue to render publicly (`ServiceMenuPublic` is benign with an empty/null menu).
2. **Drop the column** (only if you're sure no listing uses it):
   ```sql
   ALTER TABLE public.listings DROP COLUMN IF EXISTS service_menu;
   ```

Production (`main` + naranjogo.com.mx) is **never at risk** while we're on the `tailoring-mvp` branch. Only merging to `main` puts it live — and even then, every existing seller and non-tailor provider sees zero change.

---

*Last updated: Phase T1 code complete on `tailoring-mvp` branch (architecture corrected — tailoring goes through `/unete`, sell/buy untouched). Update after first preview deploy and smoke test.*
