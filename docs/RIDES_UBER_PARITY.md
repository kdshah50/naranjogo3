# Rides — Uber / DiDi parity tracker (Mexico)

**DD = DiDi** (滴滴), the ride-hail app widely used in Mexico — not DoorDash.

Goal: end-to-end ride flow that **feels like Uber or DiDi in Mexico**, while keeping NaranjoGo advantages:

- **WhatsApp** — every status step (Twilio); deep links to `/viaje` and `/conductor/viajes` (DiDi relies mostly on in-app push; we keep WhatsApp as differentiator)
- **In-app messaging** — existing listing/chat infrastructure (future: ride thread, DiDi-style contact)
- **OXXO wallet** — prepaid saldo, no cash bypass (DiDi allows cash; we stay digital-only)
- **Colonia-native pickup** — San Miguel addresses (like DiDi/Uber colonia + reference points)

**Pass criteria:** two phones, one preview URL, same `ticket_code` from request → complete, **zero SQL during the trip**.

---

## What users expect (Uber & DiDi México)

| Moment | Rider (Uber / DiDi) | Driver (Uber / DiDi) |
|--------|---------------------|----------------------|
| Request | Tarifa estimada, “buscando conductor” | — |
| Matched | Foto, nombre, auto, placas + mapa | Tarjeta de viaje, aceptar/rechazar |
| Accepted | Auto en mapa + ETA | Navegar (Waze / Google Maps) |
| Arrived | “Tu conductor llegó” | Pedir código / confirmar origen |
| En curso | Ruta al destino | Completar al llegar |
| Terminado | Recibo + calificar + propina | Resumen de pago |

Both apps: **one account per phone**, **instant status sync**, **no manual DB fixes**.

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🚧 | In progress |
| ⬜ | Not started |

---

## Phase 0 — Identity & test hygiene

| # | Item | Uber / DiDi equivalent | Status |
|---|------|------------------------|--------|
| 0.1 | One canonical user per phone at OTP login | Single account | ✅ `findOrInsertLoginUserForPhone` |
| 0.2 | One-time preview DB merge (3 UUIDs → 1) | — | ⬜ Run scripts (see [RIDES_PHASE0.md](./RIDES_PHASE0.md)) |
| 0.3 | Auto-cancel stale test rides >24h | Clean slate | ✅ cron + `rides-phase0-preview-setup.sql` |
| 0.4 | DB constraint: one active ride per buyer | No ghost trips | ✅ migration + API guard |

---

## Phase 1 — Reliable sync (DB = UI) ✅

Implemented 2026-06-01. Both panels call `GET /api/rides/sync`; server row replaces client state (no monotonic merge on poll).

| # | Item | Uber / DiDi equivalent | Status |
|---|------|------------------------|--------|
| 1.1 | `GET /api/rides/sync` — single source of truth | One trip object | ✅ |
| 1.2 | `/viaje` uses sync only (no merge wars) | Rider home | ✅ |
| 1.3 | `/conductor/viajes` uses sync only | Driver home | ✅ |
| 1.4 | `fetchRideSync()` client helper | — | ✅ |
| 1.5 | SSE + 12s poll backup (unchanged) | Push updates | ✅ |
| 1.6 | `emitRidePhaseNotifications` all transitions | Push + SMS | ✅ accept→complete; ✅ request/match WhatsApp |
| 1.7 | `npm run test:rides-full` → complete lifecycle | CI gate | ✅ |

---

## Phase 2 — Rider “¿quién me recoge?” (Uber / DiDi card)

| # | Item | Uber / DiDi equivalent | Status |
|---|------|------------------------|--------|
| 2.1 | `driver_public` on sync (name, car, plates, color) | Driver card | ✅ basic on `/viaje` |
| 2.2 | Mapbox map on `/viaje` after match | Live map | ⬜ |
| 2.3 | Driver car marker from `last_lat/lng` | Moving dot | ⬜ |
| 2.4 | ETA text (“~4 min”) via Mapbox Directions | ETA | ⬜ |
| 2.5 | Status timeline UI (solicitado → … → terminado) | Trip tracker | ⬜ |
| 2.6 | Share trip link (optional) | DiDi “compartir viaje” | ⬜ |

---

## Phase 3 — Driver experience (conductor)

| # | Item | Uber / DiDi equivalent | Status |
|---|------|------------------------|--------|
| 3.1 | Full-screen job card on match | Incoming request + sound | ⬜ (list today) |
| 3.2 | Navigate → Google Maps / Waze deep link | “Navegar” | ⬜ |
| 3.3 | GPS ping every 5–10s while online + on trip | Location stream | ⬜ (ping on Conectar only) |
| 3.4 | Background location while trip active | Driver tracking | ⬜ |
| 3.5 | Accept countdown / reject (optional) | DiDi accept window | ⬜ |

---

## Phase 4 — Post-trip & ops

| # | Item | Uber / DiDi equivalent | Status |
|---|------|------------------------|--------|
| 4.1 | Tip on complete | Propina | ✅ basic on `/viaje` |
| 4.2 | Rating driver / rider (estrellas) | Calificación | ⬜ |
| 4.3 | Receipt in WhatsApp + in-app | Recibo | ✅ WhatsApp complete |
| 4.4 | Admin dispatch debug | Internal tools | ✅ |
| 4.5 | Ride-scoped in-app chat (buyer ↔ driver) | Contacto en app | ⬜ (reuse `ListingChat` pattern) |

---

## Mexico-specific (NaranjoGo vs Uber / DiDi)

| Topic | Uber / DiDi México | NaranjoGo (keep) |
|-------|-------------------|------------------|
| Notifications | In-app push (+ SMS sometimes) | **WhatsApp** every step ✅ |
| Payment | Tarjeta, efectivo (DiDi), wallet | **OXXO saldo** ✅ |
| Login | SMS / app | **WhatsApp OTP** ✅ |
| Language | Español | Español ✅ |
| Pickup | Colonia + referencia | **Colonias SMA** ✅ |
| Navigation | Waze / Google in driver app | Deep links (Phase 3) ⬜ |

---

## Test checklist (Mexico driver)

Before session:

1. Run `rides-one-driver-cleanup.sql` on preview (once)
2. Bookmark **one** Vercel preview URL
3. Both phones: logout `/unete` → login same test numbers
4. `npm run test:rides-full` green

During session (no SQL):

| Step | Rider `/viaje` | Driver `/conductor/viajes` | WhatsApp |
|------|----------------|----------------------------|----------|
| Request | Tarifa + solicitar | — | Buyer: solicitud |
| Matched | Conductor asignado | Ver viaje + Aceptar | Both: ticket |
| Accepted | En camino | Llegué al origen | Both |
| Arrived | En origen | Iniciar + código | Both |
| In trip | En curso | Completar | Both |
| Complete | Completado + cargo | — | Both + receipt |

---

## Files (Phase 1)

| File | Role |
|------|------|
| `lib/rides/ride-sync-server.ts` | Server sync loader |
| `app/api/rides/sync/route.ts` | Sync API |
| `lib/rides/client-ride-sync.ts` | `fetchRideSync()` |
| `app/viaje/page.tsx` | Rider UI |
| `app/conductor/viajes/page.tsx` | Driver UI |
| `scripts/test-rides-full-e2e.ts` | Full lifecycle test |

See also: [RIDES_STABILITY_PLAN.md](./RIDES_STABILITY_PLAN.md), [RIDES_STAGING.md](./RIDES_STAGING.md).
