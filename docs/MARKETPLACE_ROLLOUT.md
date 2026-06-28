# Marketplace rollout (production defaults)

Live site: **https://naranjogo.com.mx**

## Service area — CP 37700

The default postal code for San Miguel de Allende is **`37700`** (not 37745).

It appears in:

| Location | Purpose |
|----------|---------|
| `components/Hero.tsx` | Landing hero badge + subtitle (ES/EN) |
| `app/page.tsx` | `SMA_ZIP` constant |
| `app/api/listings/route.ts` | Default `zip_code` on new listings |
| `app/api/provider-signup/route.tsx` | Default zip for provider signup |
| `app/api/search/route.ts` | `SMA_ZIP` constant |
| `lib/rides/driver-onboarding.ts` | Default zip for driver listings |
| `supabase/seed-sample-electronics-listing.sql` | Sample seed data |

To change the CP globally, search the repo for `37700` and update all occurrences.

## Category tabs — Services only (MVP)

The home page category bar is controlled by **`browseEnabled`** in `lib/marketplace-categories.ts`.

**Production (current):** only **Services** (`browseEnabled: true`). Electronics, Vehicles, Fashion, Home, Real Estate, and Sports stay in the config with `browseEnabled: false` — they are hidden from the bar and URLs like `/?category=electronics` fall back to Services via `normalizeBrowseCategory()`.

**To enable a category for testing or launch:** set its row to `browseEnabled: true` in `lib/marketplace-categories.ts`. The tab appears on the next deploy with no other code changes. Keep `PRICE_FLOORS` in `app/api/listings/route.ts` in sync when adding goods categories.

**UI:** `components/CategoryBar.tsx` renders only categories where `browseEnabled` is true.

## Service verticals (landing pages + signup slugs)

| Vertical | Landing | Signup slug (`/unete?service=`) | Menu in signup |
|----------|---------|-----------------------------------|----------------|
| Home cleaning | `/limpieza-del-hogar` | `limpieza` | Yes |
| Veterinary | `/veterinaria` | `veterinaria` | Yes |
| Pet care | `/cuidado-mascotas` | `paseador`, `pet_sitting`, `estetica_canina` | Yes |
| Taxi / rides | `/transporte` | `transporte_app` | Yes — **`RIDES_ENABLED=false` on prod** |
| Tailoring | `/arreglos-de-ropa` | `arreglos_de_ropa` | Yes |
| Bilingual errands | `/mandados-bilingue` | `mandados` | No (chat + agreed price) |

Constants: `lib/provider-services.ts` (`BILINGUAL_ERRANDS_SERVICE`, `TAILORING_SERVICE`, etc.).

## Hero layout (landing page)

All in `components/Hero.tsx` (top → bottom): search bar → price sliders → **service shortcut chips** → Near me → **colonia chips**.

There is **no second service tab row** on the home page. `ServiceVerticalTabs.tsx` was removed; vertical links live only in the hero chip row below the sliders.

### Service shortcut chips

Six verticals in `HERO_SERVICE_CHIPS`. Display order is **A→Z by translated label** at runtime (`localeCompare` for `es` / `en`). Home cleaning stays **gold** (`featured: true`); the other five use translucent white styling.

| Chip (ES label order) | Route | Notes |
|-----------------------|-------|--------|
| Arreglos de ropa | `/arreglos-de-ropa` | |
| Cuidado de mascotas | `/cuidado-mascotas` | |
| Limpieza del hogar | `/limpieza-del-hogar` | Gold chip; primary vertical |
| Mandados bilingüe | `/mandados-bilingue` | |
| Taxi / transporte | `/transporte` | Rides off prod until `RIDES_ENABLED=true` |
| Veterinaria | `/veterinaria` | |

Footer cross-links: `components/TrustBar.tsx` (cleaning, tailoring, bilingual errands).

To add a chip: extend `T` label keys, add an entry to `HERO_SERVICE_CHIPS`, and add a landing page under `app/<slug>/page.tsx` following the other verticals.

### Colonia chips

Below “Near me”. Keys come from `lib/colonias.ts` and render in **A→Z order** via `sortedColoniaKeys(lang)`.

### Tianguis hover story

`components/TianguisWordmark.tsx` — bilingual brand paragraph on header wordmark hover (desktop).

## Saldo Naranjo (wallet) for services

Buyers can load prepaid balance at **`/saldo`** and pay the **platform fee / deposit** on service listings with **Saldo Naranjo** (cleaning, vet, pet, tailoring, errands, etc.).

| Env var | Production default | Purpose |
|---------|-------------------|---------|
| `WALLET_ENABLED` | unset (off) | Set `true` to enable `/saldo`, wallet top-up API, and “Pay with Saldo” on service checkout |
| `RIDES_ENABLED` | `false` | When `true`, also enables rides; wallet follows rides if `WALLET_ENABLED` is unset |
| `WALLET_TOPUP_OXXO_ENABLED` | `false` | OXXO + card top-up via Stripe (Mexican account required for OXXO) |

**Scope (v1):** `commission_only` deposit checkout only — not `full_connect`, balance supplement, or tips. Stripe Checkout remains the default; wallet is an optional payment method in `ServiceBookingBlock`.

**Key files:** `lib/wallet-flags.ts`, `lib/wallet-service-payment.ts`, `app/api/bookings/checkout/route.ts`, `app/api/rides/wallet/*`, `components/ServiceBookingBlock.tsx`.

**Rollout:** set `WALLET_ENABLED=true` on Vercel Production when ready; no need to enable rides.
