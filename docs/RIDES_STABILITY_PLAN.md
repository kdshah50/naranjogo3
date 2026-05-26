# Rides stability plan

This doc explains **why testing felt like 100 SQL fixes**, what “stable” means, and a **phased plan** so driver + rider stay in sync (in-app + WhatsApp) without manual Supabase edits per trip.

---

## Why today was so painful (root causes)

| Problem | What you saw | Real fix |
|--------|----------------|----------|
| **Duplicate `users` rows** (same phone, 3 UUIDs) | Driver panel empty, rider poll wrong buyer, WhatsApp to wrong row | **Once:** `merge-duplicate-users-by-phone.sql` on preview |
| **Stale rows in DB** (old `in_trip` / `matched` left from tests) | Rider UI flipped completed → in trip; driver saw old ticket | **Once:** `rides-cancel-stale-active-test-rides.sql` |
| **Client-side “merge” bugs** | Polling kept old trip in React state | **Code:** server is source of truth; replace list on load (deployed on `rides-setup`) |
| **Polling only (no push)** | 2–6s delay; tab focus / race conditions | **Next:** Supabase Realtime **or** SSE on `ride_bookings` |
| **WhatsApp not wired for every step** | Some steps only in-app | **Next:** one `notifyRidePhase()` on every status change (buyer + driver) |
| **SQL scripts were band-aids** | Felt like fixing product with SQL | They fix **data debt**, not replace product logic |

You should **not** need per-ride SQL for a normal trip after one-time cleanup + merge.

---

## Do you need another messaging product?

**No.** Twilio WhatsApp is fine for notifications.

What you need is **reliable delivery of facts**, not a second chat app:

1. **Single writer** — only server changes `ride_bookings.status` (already true).
2. **Notify on every transition** — after DB commit, call Twilio (already partial; being completed).
3. **UI reads one API** — `GET /api/rides/[id]` + optional Realtime (no merging old client rows).

Optional later: **queue** (Inngest / Bull / Supabase Edge) if Twilio retries matter — not required for staging.

---

## Target: one trip, both sides, every step

| Step | DB status | Rider in-app | Driver in-app | Rider WhatsApp | Driver WhatsApp |
|------|-----------|--------------|---------------|----------------|-----------------|
| Requested | `requested` | ✓ | — | Solicitud + link | — |
| Matched | `matched` | Asignado | Aceptar | Ticket + link | Nuevo viaje + panel link |
| Accepted | `accepted` | En camino | Llegué al origen | Conductor en camino | (add) Confirmado |
| At pickup | `arrived` | En origen | Iniciar + código | En el origen | (add) En origen |
| Started | `in_trip` | En curso | Completar | Viaje en curso | (add) En curso |
| Done | `completed` | Completado + cargo | — | Completado + cargo | Completado + pago |

In-app updates: **Realtime subscription** on `ride_bookings` row (Phase 2) replaces aggressive polling.

---

## Phased implementation (recommended order)

### Phase 0 — One-time on preview (30 min, you + Supabase)

Run **once** before the next test day:

1. `merge-duplicate-users-by-phone.sql`
2. `rides-restore-driver-profile.sql` (if Conectar ever breaks)
3. `rides-cancel-stale-active-test-rides.sql` (after messy tests)

Bookmark **one URL**: `https://naranjogo3-git-rides-setup-jigna-shahs-projects.vercel.app`

Driver: `/conductor/viajes` · Rider: `/viaje` · Same phones every time.

### Phase 1 — Code hardening (1–2 days dev)

- [x] Rider: pin ride id, no status downgrade, completed in `/active` display
- [x] Driver: replace trip list from API (no stale merge)
- [ ] **Central `notifyRidePhase(ride, phase)`** — buyer + driver, every transition
- [ ] **Single sync endpoint** `GET /api/rides/sync?ride_id=` used by both UIs
- [ ] **Automated E2E** — `npm run test:rides-full` in CI on `rides-setup`

### Phase 2 — Real-time in-app (1 day dev)

- Supabase Realtime on `ride_bookings` filtered by `id` (rider + driver subscribe after match)
- Polling becomes backup (30s), not primary
- Removes “wait 6 seconds” and flip-flop races

### Phase 3 — Production hygiene (later)

- DB constraint: one active ride per buyer (optional)
- On match: auto-cancel other `matched` for same driver (already in code)
- Merge users at **signup** (no new duplicates)
- Twilio send log table + retry

---

## How to test tomorrow (2 phones, no SQL)

1. Both open **stable preview URL** (not random deploy links).
2. Rider: `/viaje` → request trip → note **new** ticket (not an old one).
3. Driver: `/conductor/viajes` → Conectar → see **same ticket** → accept → arrive → start → complete.
4. Rider: leave `/viaje` open; status should move without refresh after Phase 2; until then refresh is OK.
5. If driver panel empty but WhatsApp arrived → run `rides-fix-ride-driver-assignment.sql` **once** for that ticket pattern, then fix assignment in code.

**Pass criteria:** same `ticket_code` on both phones end-to-end; wallet charge once; no SQL during the trip.

---

## Automated check (local / CI)

```bash
# Health: DB + driver profile + env
npm run test:rides-staging

# Full lifecycle (needs .env.local + RIDES_ENABLED)
npm run test:rides-full
```

---

## Summary

- The embarrassment is from **test data + duplicate users + client merge bugs**, not because rides are impossible.
- **SQL scripts are one-time cleanup**, not the long-term product model.
- **Twilio stays**; add **Realtime + centralized notify**, not a new messenger.
- After Phase 0 + current `rides-setup` deploy, the next test should be dramatically calmer.

See also: [RIDES_STAGING.md](./RIDES_STAGING.md), [RIDES_FULL_MANUAL_TEST.md](./RIDES_FULL_MANUAL_TEST.md).
