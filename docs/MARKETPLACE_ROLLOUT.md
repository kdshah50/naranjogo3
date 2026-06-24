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

## Hero service shortcuts (landing page)

Chips under the search bar in `components/Hero.tsx`:

| Chip | Route | Notes |
|------|-------|--------|
| Home cleaning | `/limpieza-del-hogar` | Primary vertical (gold chip); buyers search via hero search bar or landing CTA |
| Veterinary | `/veterinaria` | |
| Pet care | `/cuidado-mascotas` | |
| Taxi / rides | `/transporte` | Rides off prod until `RIDES_ENABLED=true` |
| Tailoring | `/arreglos-de-ropa` | |
| Bilingual errands | `/mandados-bilingue` | |

Footer cross-links: `components/TrustBar.tsx` (cleaning, tailoring, bilingual errands).

To add a chip: extend the `T` translations and a `Link` in the Hero shortcuts block; add a landing page under `app/<slug>/page.tsx` following the other verticals.
