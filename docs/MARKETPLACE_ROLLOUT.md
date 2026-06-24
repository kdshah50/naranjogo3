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
