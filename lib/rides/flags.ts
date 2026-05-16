/**
 * Feature flags for the rides module (taxi / ride-hailing vertical).
 *
 * `RIDES_ENABLED` is the master kill switch. When false (default), every
 * rides-only route returns 404 and `isRideListing()` (added later) is forced
 * to false, so any stray ride data in the DB is treated as a regular service
 * listing. Nothing in existing flows (cart, services, provider signup) reads
 * this flag.
 *
 * Set RIDES_ENABLED=true in Vercel for preview deployments to test the new
 * vertical. Production stays false until launch.
 *
 * See: docs/RIDES_AI_PLAN.md §14 (Feature flags & kill switches).
 */
export function isRidesEnabled(): boolean {
  return String(process.env.RIDES_ENABLED ?? "").trim().toLowerCase() === "true";
}
