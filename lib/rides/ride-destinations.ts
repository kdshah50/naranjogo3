/**
 * Reference ride places synced with taxiRideShareStarterMenu() listing fares.
 * Only menu SKUs that map to a geographic location are included here.
 */

import { COLONIAS } from "@/lib/colonias";
import { taxiRideShareStarterMenu } from "@/lib/listing-service-menu";
import type { EstimateFareOptions } from "@/lib/rides/ride-pricing";

export const QUICK_INDIVIDUAL_SKU = "quick_individual";
export type RideTripType = "standard" | "quick_individual";

export type RideReferencePlace = {
  sku: string;
  lat: number;
  lng: number;
  label: string;
  label_en: string;
  reference_fare_mxn_cents: number;
  is_airport: boolean;
};

/** Coordinates for location-based taxi menu SKUs. */
const REFERENCE_COORDS: Record<string, { lat: number; lng: number }> = {
  centro_atotonilco: { lat: 20.9297, lng: -100.7447 },
  return_sma: { lat: 20.9146, lng: -100.7439 },
  airport_guanajuato: { lat: 20.9933, lng: -101.4808 },
  airport_leon: { lat: 21.1253, lng: -101.686 },
  airport_queretaro: { lat: 20.6173, lng: -100.1856 },
  airport_cdmx: { lat: 19.4363, lng: -99.0721 },
};

const AIRPORT_REFERENCE_KEYS = new Set([
  "airport_guanajuato",
  "airport_leon",
  "airport_queretaro",
  "airport_cdmx",
]);

function buildReferencePlaces(): Record<string, RideReferencePlace> {
  const places: Record<string, RideReferencePlace> = {};
  for (const item of taxiRideShareStarterMenu().items) {
    const coords = REFERENCE_COORDS[item.sku];
    if (!coords) continue;
    places[item.sku] = {
      sku: item.sku,
      lat: coords.lat,
      lng: coords.lng,
      label: item.name_es,
      label_en: item.name_en,
      reference_fare_mxn_cents: item.price_mxn_cents,
      is_airport: AIRPORT_REFERENCE_KEYS.has(item.sku),
    };
  }
  return places;
}

export const RIDE_REFERENCE_PLACES = buildReferencePlaces();
export const RIDE_REFERENCE_PLACE_KEYS = Object.keys(RIDE_REFERENCE_PLACES);

/** @deprecated Use isRideReferencePlaceKey */
export function isFixedRideDestinationKey(key: string): boolean {
  return isRideReferencePlaceKey(key);
}

export function isRideReferencePlaceKey(key: string): boolean {
  return key in RIDE_REFERENCE_PLACES;
}

export function isAirportReferenceKey(key: string): boolean {
  return RIDE_REFERENCE_PLACES[key]?.is_airport === true;
}

export function referenceFareForPlaceKey(key: string): number | null {
  const place = RIDE_REFERENCE_PLACES[key];
  return place ? place.reference_fare_mxn_cents : null;
}

/** @deprecated Use referenceFareForPlaceKey */
export function fixedPriceForDestinationKey(key: string): number | null {
  return referenceFareForPlaceKey(key);
}

export function referencePlaceLabel(key: string, lang: "es" | "en" = "es"): string {
  const place = RIDE_REFERENCE_PLACES[key];
  if (!place) return key;
  return lang === "en" ? place.label_en : place.label;
}

/** @deprecated Use referencePlaceLabel */
export function fixedDestinationLabel(key: string, lang: "es" | "en" = "es"): string {
  return referencePlaceLabel(key, lang);
}

/** @deprecated Use RIDE_REFERENCE_PLACE_KEYS */
export const RIDE_FIXED_DESTINATION_KEYS = RIDE_REFERENCE_PLACE_KEYS;

/** @deprecated Use RIDE_REFERENCE_PLACES */
export const RIDE_FIXED_DESTINATIONS = RIDE_REFERENCE_PLACES;

export function fareOptionsForDropoffKey(dropoffKey: string | null | undefined): EstimateFareOptions {
  if (!dropoffKey) return {};
  const referenceFare = referenceFareForPlaceKey(dropoffKey);
  if (referenceFare === null) return {};
  return {
    fixed_price_mxn_cents: referenceFare,
    force_reference_fare: isAirportReferenceKey(dropoffKey),
  };
}

export function quickIndividualFarePerStopCents(): number {
  const item = taxiRideShareStarterMenu().items.find((i) => i.sku === QUICK_INDIVIDUAL_SKU);
  return item?.price_mxn_cents ?? 8000;
}

export function isLocalColoniaKey(key: string): boolean {
  return key in COLONIAS && key !== "otro";
}

export function encodeQuickIndividualStopsMeta(stopKeys: string[]): string {
  return JSON.stringify({
    trip_type: "quick_individual",
    stops: stopKeys,
  });
}
