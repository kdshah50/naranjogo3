import { haversineMeters } from "@/lib/rides/ride-pricing";

/** GPS older than this is treated as stale in rider UI. */
export const DRIVER_GPS_STALE_MS = 2 * 60 * 1000;

/** Assumed urban speed in San Miguel for haversine ETA fallback (km/h). */
export const RIDE_ETA_FALLBACK_KMH = 25;

export function isDriverLocationFresh(
  lastLocationAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastLocationAt) return false;
  const t = Date.parse(lastLocationAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= DRIVER_GPS_STALE_MS;
}

export function haversineEtaMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  speedKmh = RIDE_ETA_FALLBACK_KMH,
): { distance_m: number; duration_s: number; eta_minutes: number } {
  const distance_m = haversineMeters(fromLat, fromLng, toLat, toLng);
  const speedMps = (speedKmh * 1000) / 3600;
  const duration_s = speedMps > 0 ? Math.round(distance_m / speedMps) : 0;
  const eta_minutes = Math.max(1, Math.ceil(duration_s / 60));
  return { distance_m, duration_s, eta_minutes };
}

export function formatEtaMinutes(minutes: number, lang: "es" | "en"): string {
  const m = Math.max(1, Math.round(minutes));
  if (lang === "es") return m === 1 ? "~1 min" : `~${m} min`;
  return m === 1 ? "~1 min" : `~${m} min`;
}
