# Tailoring / Dress Alteration MVP — Progress Log

A running log of what's built, what's deployed, and how to verify each step.
Mirror format of `docs/RIDES_PROGRESS.md`. Keep updating after every step.

---

## Status snapshot

| Item | Value |
|---|---|
| Branch | `tailoring-mvp` (forked from `main`) |
| Strategy | Additive: new `service_menu` jsonb column + isolated UI components. Zero changes to existing service-booking, marketplace-cart, or Stripe flows. |
| Master kill-switch | None needed — sellers without a menu keep the legacy flow byte-for-byte. |
| Latest step completed | **Phase T1 — code complete on branch, awaiting first deploy + manual test** |
| Next step | Deploy `tailoring-mvp` to Vercel preview, run the buyer/seller smoke test below, then merge to `main` |

---

## Decision log

- **Reuse existing flows.** Buyer chats with seller in-app → seller sets agreed total → Stripe Checkout (commission + IVA) → wa.me unlock on success. We only **add** a structured menu and a quote builder; we don't touch booking, cart, payment, or webhook code.
- **Stay on Twilio for WhatsApp.** Confirmed by Twilio docs that interactive list/button messages are available via Twilio Content API. No provider migration ever required for this project.
- **No new tables.** A single `service_menu jsonb` column on `listings` carries the menu. Nullable. Existing rows = `NULL` = behavior unchanged.
- **No new Stripe primitives.** The quote builder's total flows into the existing `listing_service_contact_gate.agreed_subtotal_mxn_cents` field. `lib/marketplace-cart-pricing.ts` already calculates commission + IVA from that base for `full_connect` mode.
- **WhatsApp bot is deferred to Phase T3.** Only build it after real tailor demand validates the MVP.

---

## What shipped in Phase T1

### Database

- `supabase/migrations/20260518150000_listings_service_menu.sql` — adds `service_menu jsonb` column with a lightweight `CHECK` that, if present, the value must be an object with an `items` array. All deeper validation runs in application code (Spanish error messages).

### Server / API

- `lib/listing-service-menu.ts` — types, validation, sanitization, and a `tailoringStarterMenu()` template with 20 mid-of-range Mexican neighborhood-tailor prices.
- `app/api/listings/route.ts` — POST now accepts an optional `service_menu` field. Validated; only stored when at least one item is present so non-menu service listings keep `NULL`.
- `app/api/listings/[id]/route.ts` — PATCH accepts `service_menu` (owner only — admin block-list unchanged). Sending `null` or an empty menu clears it. Validated.

### UI components

- `components/SellModal.tsx` — when category is `services`, shows a "Menú de servicios · Opcional" editor with name + price rows, a "+ Agregar servicio" button, and a "Cargar plantilla de costurería" shortcut that pre-fills the 20-item tailoring starter menu. Sellers without a menu publish exactly as before.
- `components/ServiceMenuPublic.tsx` — read-only render of the menu on the public listing page (formatted MXN, optional `name_en` if user is in English, inspection disclaimer).
- `components/ServiceMenuQuoteBuilder.tsx` — seller-only quote builder embedded inside the existing amber "Precio acordado" box in `ListingChat`. + / − qty controls, running subtotal, two CTAs:
  - **Aplicar al precio acordado** → fills the existing `agreedPesos` input (the seller still clicks "Guardar" to save — preserves the existing review step).
  - **Enviar al chat** → posts a formatted item list with subtotal and disclaimer as a regular chat message the buyer can see.
- `components/ListingChat.tsx` — new `serviceMenu` prop, mounts `ServiceMenuQuoteBuilder` inside the seller's agreed-price panel when present; refactored message-send into `postMessageBody` so the quote builder and the regular send share one code path.
- `app/listing/[id]/page.tsx` — renders `ServiceMenuPublic` next to the package-promo block on service listings and forwards `service_menu` to `ListingChat`.

### Disclaimer surfacing

The "El precio puede ajustarse al revisar la prenda físicamente." disclaimer appears in:
1. `SellModal` while authoring the menu.
2. `ServiceMenuPublic` on the public listing page.
3. `ServiceMenuQuoteBuilder` in the seller's chat panel.
4. The chat message body when seller uses "Enviar al chat".

That's three reads before the buyer hits "Pagar" — sufficient for MVP without touching `ServiceBookingBlock`.

---

## How to verify (smoke test) once the preview is up

### Test seller flow

1. Log in as the seller account.
2. Open the **Vender** modal.
3. On step 2, pick category **🔧 Servicios**.
4. Scroll to **"MENÚ DE SERVICIOS · OPCIONAL"**.
5. Click **"Cargar plantilla de costurería"** — 20 rows should appear, each with a Spanish name and a peso price.
6. Optionally edit a row's price or click ✕ to delete it.
7. Finish publishing as usual (title, price, photos, etc.).

### Test buyer flow

1. Open the published listing.
2. Below the title/price, you should see a **"Menú de servicios"** card listing every menu item with its price, plus the inspection disclaimer at the bottom.
3. As a buyer, click **"Escribir al vendedor"** (or scroll to the chat panel).

### Test seller-in-chat flow

1. As the seller, open the chat for that listing.
2. Click on the buyer's row to open the conversation.
3. In the amber **"Precio acordado del trabajo"** box, you should now see **"Arma un presupuesto desde tu menú"** with all menu items.
4. Tap + a few times across different items.
5. The running subtotal should update live.
6. Click **"Aplicar al precio acordado"** → the pesos input above should populate with the running subtotal.
7. Click **"Guardar"** as usual to persist the agreed price.
8. Optionally click **"Enviar al chat"** to drop the line-item breakdown into the conversation.
9. Buyer side: the chat shows the structured message and can click the existing "Pagar" CTA.

### Confirm zero regression on non-menu service listings

- Open any existing service listing (taxi, plumber, etc.) that has no menu.
- The new "Menú de servicios" card should **not** appear.
- The seller's chat panel should look exactly like before (no quote builder).
- Buyer payment flow unchanged.

---

## Phase T2 — Tailoring vertical landing + onboarding (next, 2–3 days)

When T1 has been deployed and smoke-tested:

- A `/arreglos-de-ropa` (or `/tailoring`) landing page that markets the vertical and links to **Únete** / **Vender** with the tailoring starter menu pre-loaded.
- Add a "Tailoring" provider service slug to `lib/provider-services.ts` so the existing **Únete** flow recognizes it and admin verification surfaces it as its own queue.
- Recruit 5–10 tailors. Onboard them through the existing seller flow. They publish their menu through SellModal.

## Phase T3 — WhatsApp interactive bot (deferred, only if T2 validates demand)

- Build `/api/whatsapp/inbound` route that Twilio posts inbound messages to (Twilio Content API + Quick Reply / List message templates).
- Per-phone session store (Redis or a `whatsapp_sessions` table) for cart state.
- Estimated 1–2 weeks; only build if Phase T2 produces real bookings.

---

## Rollback plan

The entire feature is additive and behind a NULL-default column:

1. **Hide the UI** without touching the DB:
   ```bash
   # Revert the UI commits but keep the column. Sellers stop seeing the menu editor.
   git revert <commit-sha>
   git push
   ```
2. **Drop the column** (only if you're sure no listing uses it):
   ```sql
   ALTER TABLE public.listings DROP COLUMN IF EXISTS service_menu;
   ```

Production (`main` + naranjogo.com.mx) is **never at risk** while we're on the `tailoring-mvp` branch. Only merging the branch to `main` puts it live — and even then, every seller with no menu sees zero change.

---

*Last updated: Phase T1 code complete on `tailoring-mvp` branch. Update after first preview deploy and smoke test.*
