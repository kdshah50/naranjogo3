import { COLONIAS, coloniaLabel } from "@/lib/colonias";
import {
  isRideReferencePlaceKey,
  referencePlaceLabel,
  RIDE_REFERENCE_PLACES,
} from "@/lib/rides/ride-destinations";
import type { RideLocation } from "@/lib/rides/ride-pricing";

export function locationFromColoniaKey(
  coloniaKey: string,
  addressOverride?: string
): RideLocation | null {
  const info = COLONIAS[coloniaKey];
  if (!info) return null;
  return {
    lat: info.lat,
    lng: info.lng,
    address: addressOverride?.trim() || coloniaLabel(coloniaKey, "es"),
  };
}

/** Resolve pickup/dropoff key as a colonia or listing reference place. */
export function locationFromRidePlaceKey(
  placeKey: string,
  addressOverride?: string,
  lang: "es" | "en" = "es",
): RideLocation | null {
  const colonia = locationFromColoniaKey(placeKey, addressOverride);
  if (colonia) return colonia;

  const ref = RIDE_REFERENCE_PLACES[placeKey];
  if (!ref) return null;
  return {
    lat: ref.lat,
    lng: ref.lng,
    address: addressOverride?.trim() || referencePlaceLabel(placeKey, lang),
  };
}

export function isValidRidePlaceKey(key: string): boolean {
  return !!COLONIAS[key] || isRideReferencePlaceKey(key);
}

/** @deprecated Use isValidRidePlaceKey */
export function isValidRideDropoffKey(key: string): boolean {
  return isValidRidePlaceKey(key);
}

export function ridePlaceLabel(key: string, lang: "es" | "en" = "es"): string {
  if (COLONIAS[key]) return coloniaLabel(key, lang);
  return referencePlaceLabel(key, lang);
}
