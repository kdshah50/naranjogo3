import { COLONIAS, coloniaLabel } from "@/lib/colonias";
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
