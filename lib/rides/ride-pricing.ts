/**
 * Deterministic ride fare math (no LLM). See docs/RIDES_AI_PLAN.md §6 agent table.
 */

import {
  fareOptionsForDropoffKey,
  normalizeWaitTimeHours,
  quickIndividualFarePerStopCents,
  waitTimeFarePerHourCents,
  type RideTripType,
} from "@/lib/rides/ride-destinations";

const BASE_FARE_MXN_CENTS = 8000;
const PER_KM_MXN_CENTS = 1200;
const PER_MIN_MXN_CENTS = 150;
/** Assumed average speed in SMA for ETA when Mapbox is not wired yet. */
const AVG_SPEED_KMH = 25;
const HOLD_MULTIPLIER = 1.5;
const MIN_FARE_MXN_CENTS = 10000;

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
  /** Distance-based total before optional fixed-price floor. */
  calculated_total_mxn_cents: number;
  /** Set when destination has a fixed menu price. */
  fixed_price_mxn_cents: number | null;
  /** True when fixed price exceeded the calculated fare. */
  used_fixed_price: boolean;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
  /** Set for quick individual multi-stop trips. */
  quick_individual_stops?: number;
  quick_individual_per_stop_mxn_cents?: number;
  /** Trip fare before optional wait time. */
  trip_fare_mxn_cents?: number;
  wait_time_hours?: number;
  wait_time_mxn_cents?: number;
};

export type EstimateFareOptions = {
  fixed_price_mxn_cents?: number | null;
  /** When true (airport destinations), reference fare is always the total. */
  force_reference_fare?: boolean;
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

export function estimateQuickIndividualFare(
  destinationCount: number,
  route?: { pickup: RideLocation; stops: RideLocation[] },
): FareEstimate {
  const stopCount = Math.max(1, Math.min(8, Math.round(destinationCount)));
  const perStop = quickIndividualFarePerStopCents();
  const estimated_total_mxn_cents = stopCount * perStop;

  let distance_m = 0;
  if (route?.stops.length) {
    let prev = route.pickup;
    for (const stop of route.stops) {
      distance_m += haversineMeters(prev.lat, prev.lng, stop.lat, stop.lng);
      prev = stop;
    }
  }
  const duration_s = estimateDurationSeconds(distance_m || 1);

  return {
    distance_m,
    duration_s,
    base_mxn_cents: perStop,
    distance_mxn_cents: 0,
    time_mxn_cents: 0,
    surge_multiplier: 1,
    calculated_total_mxn_cents: estimated_total_mxn_cents,
    fixed_price_mxn_cents: estimated_total_mxn_cents,
    used_fixed_price: true,
    estimated_total_mxn_cents,
    hold_amount_mxn_cents: Math.ceil(estimated_total_mxn_cents * HOLD_MULTIPLIER),
    quick_individual_stops: stopCount,
    quick_individual_per_stop_mxn_cents: perStop,
  };
}

export function estimateFare(
  pickup: RideLocation,
  dropoff: RideLocation,
  when: Date = new Date(),
  options?: EstimateFareOptions
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
  const calculated_total_mxn_cents = Math.round(subtotal * surge_multiplier);

  const fixedPrice =
    typeof options?.fixed_price_mxn_cents === "number" &&
    Number.isFinite(options.fixed_price_mxn_cents) &&
    options.fixed_price_mxn_cents > 0
      ? Math.round(options.fixed_price_mxn_cents)
      : null;
  const forceReferenceFare = options?.force_reference_fare === true;
  const used_fixed_price =
    fixedPrice !== null &&
    (forceReferenceFare || fixedPrice > calculated_total_mxn_cents);
  const estimated_total_mxn_cents =
    used_fixed_price && fixedPrice !== null
      ? fixedPrice
      : calculated_total_mxn_cents;
  const hold_amount_mxn_cents = Math.ceil(estimated_total_mxn_cents * HOLD_MULTIPLIER);

  return {
    distance_m,
    duration_s,
    base_mxn_cents,
    distance_mxn_cents,
    time_mxn_cents,
    surge_multiplier,
    calculated_total_mxn_cents,
    fixed_price_mxn_cents: fixedPrice,
    used_fixed_price,
    estimated_total_mxn_cents,
    hold_amount_mxn_cents,
  };
}

export function applyWaitTimeToFareEstimate(
  estimate: FareEstimate,
  waitTimeHours: number | null | undefined,
): FareEstimate {
  const hours = normalizeWaitTimeHours(waitTimeHours);
  const tripFare = estimate.estimated_total_mxn_cents;
  if (hours === 0) {
    return { ...estimate, trip_fare_mxn_cents: tripFare, wait_time_hours: 0, wait_time_mxn_cents: 0 };
  }
  const waitCents = hours * waitTimeFarePerHourCents();
  const total = tripFare + waitCents;
  return {
    ...estimate,
    trip_fare_mxn_cents: tripFare,
    wait_time_hours: hours,
    wait_time_mxn_cents: waitCents,
    estimated_total_mxn_cents: total,
    hold_amount_mxn_cents: Math.ceil(total * HOLD_MULTIPLIER),
  };
}

export function resolveRideFareEstimate(args: {
  tripType?: RideTripType;
  pickup: RideLocation;
  dropoff: RideLocation;
  dropoffKey?: string | null;
  stopLocations?: RideLocation[];
  waitTimeHours?: number | null;
  when?: Date;
}): FareEstimate {
  const tripType = args.tripType ?? "standard";
  const stops = args.stopLocations?.length ? args.stopLocations : [args.dropoff];
  const baseEstimate =
    tripType === "quick_individual"
      ? estimateQuickIndividualFare(stops.length, { pickup: args.pickup, stops })
      : estimateFare(
          args.pickup,
          args.dropoff,
          args.when,
          fareOptionsForDropoffKey(args.dropoffKey),
        );
  return applyWaitTimeToFareEstimate(baseEstimate, args.waitTimeHours);
}

export function formatMxnFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)} MXN`;
}
