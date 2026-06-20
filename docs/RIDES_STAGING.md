# Rides staging — one URL, one login, automated checks

Manual testing on Vercel should **not** require a new preview link or two OTP logins on every deploy.

## 1. Bookmark the stable branch URL (not each deploy email)

Vercel gives every **branch** a fixed hostname:

```text
https://<project>-git-rides-setup-<team>.vercel.app
```

- Same origin on every push to `rides-setup` → **OTP cookie stays 30 days**
- Do **not** use the one-off deployment URL from the Vercel email (`…-kdshah50-….vercel.app`) — that is a different origin and forces re-login

In the Vercel project → **Settings → Domains**, you can also attach e.g. `staging.naranjogo.com.mx` to branch `rides-setup` (optional, best UX).

The app now sets WhatsApp/deep links from `VERCEL_BRANCH_URL` on preview automatically (`lib/app-url.ts`). You do **not** need to update `NEXT_PUBLIC_APP_URL` on every deploy.

## 2. One OTP session for rider + driver (same phone)

1. Log in once at `/unete` with **415 181 6902** (preview or local).
2. Open two tabs on the **same** origin:
   - `/viaje` (passenger)
   - `/conductor/viajes` (driver)
3. OTP login prefers the row that has an **active** `driver_profiles` row (`pickLoginUserForPhone`).

Use two phones only when you need true separate accounts.

## 3. Local dev (fastest loop)

```bash
# .env.local: Supabase + JWT_SECRET + RIDES_ENABLED=true
RIDES_ENABLED=true npm run dev
```

One origin (`http://localhost:3000`), one OTP, same two tabs. No Vercel wait.

## 4. Run automated checks before manual QA

```bash
npm run test:rides-staging
# With dev server:
RIDES_ENABLED=true npm run dev
RIDES_ENABLED=true npm run test:rides-staging -- --live
```

This verifies in Supabase:

- Active `driver_profiles` + verified ride listing
- Driver resolution (Conectar path)
- No stuck open rides / wallet holds (warnings)

`--live` also calls `GET /panel` and `POST /online` with a test JWT.

## 5. When data breaks (run once in Supabase, not every deploy)

| Symptom | Script |
|--------|--------|
| Conectar gray / no profile | `rides-restore-driver-profile.sql` |
| Stuck rides / busy driver | `rides-fix-driver-test-session.sql` |
| Saldo stuck in “reservado” | `rides-release-buyer-wallet-holds.sql` |
| Duplicate OTP users (long-term) | `merge-duplicate-users-by-phone.sql` (preview only) |

## 6. Vercel Preview env (set once)

| Variable | Value |
|----------|--------|
| `RIDES_ENABLED` | `true` |
| `JWT_SECRET` | same as production preview DB (stable across deploys) |
| `NEXT_PUBLIC_APP_URL` | optional — only if using custom staging domain |

Do **not** point `NEXT_PUBLIC_APP_URL` at production while testing rides.

## 7. Pre-push checklist (agent / developer)

```bash
npm run test:ride-lifecycle
npm run test:ride-pricing
npm run test:rides-staging
```

Fix any `FAIL` before asking for manual testing on phones.
