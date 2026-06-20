/**
 * Deterministic ride fare math (no LLM). See docs/RIDES_AI_PLAN.md §6 agent table.
 */

const BASE_FARE_MXN_CENTS = 3500;
const PER_KM_MXN_CENTS = 1200;
const PER_MIN_MXN_CENTS = 150;
/** Assumed average speed in SMA for ETA when Mapbox is not wired yet. */
const AVG_SPEED_KMH = 25;
const HOLD_MULTIPLIER = 1.5;
const MIN_FARE_MXN_CENTS = 4500;

export type RideLocation = {
  lat: number;
  lng: number;
  address: string;
};

export type FareEstimate = {
  distance_m: number;
  duration_s: number;
  base_mxn_cents: number;
  distance_mxn_cents: number;
  time_mxn_cents: number;
  surge_multiplier: number;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
};

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r;
  const dLng = (lng2 - lng1) * d2r;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function estimateDurationSeconds(distanceM: number): number {
  const km = distanceM / 1000;
  const hours = km / AVG_SPEED_KMH;
  return Math.max(300, Math.round(hours * 3600));
}

/**
 * Simple surge: Fri/Sat evening in America/Mexico_City (+25%).
 */
export function surgeMultiplierForWhen(when: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(when);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const isWeekendEve = (weekday === "Fri" || weekday === "Sat") && hour >= 18 && hour <= 23;
  return isWeekendEve ? 1.25 : 1;
}

export function estimateFare(
  pickup: RideLocation,
  dropoff: RideLocation,
  when: Date = new Date()
): FareEstimate {
  const distance_m = haversineMeters(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  const duration_s = estimateDurationSeconds(distance_m);
  const distanceKm = distance_m / 1000;
  const durationMin = duration_s / 60;

  const base_mxn_cents = BASE_FARE_MXN_CENTS;
  const distance_mxn_cents = Math.round(distanceKm * PER_KM_MXN_CENTS);
  const time_mxn_cents = Math.round(durationMin * PER_MIN_MXN_CENTS);
  const surge_multiplier = surgeMultiplierForWhen(when);

  let subtotal = base_mxn_cents + distance_mxn_cents + time_mxn_cents;
  subtotal = Math.max(subtotal, MIN_FARE_MXN_CENTS);
  const estimated_total_mxn_cents = Math.round(subtotal * surge_multiplier);
  const hold_amount_mxn_cents = Math.ceil(estimated_total_mxn_cents * HOLD_MULTIPLIER);

  return {
    distance_m,
    duration_s,
    base_mxn_cents,
    distance_mxn_cents,
    time_mxn_cents,
    surge_multiplier,
    estimated_total_mxn_cents,
    hold_amount_mxn_cents,
  };
}

export function formatMxnFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)} MXN`;
}
