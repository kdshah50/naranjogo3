import { coloniaLabel, COLONIAS } from "@/lib/colonias";

export type RideRouteSummary = {
  pickup_zone: string;
  dropoff_zone: string;
  route_label: string;
};

function protectedZoneLabel(lang: "es" | "en"): string {
  return lang === "es" ? "Zona protegida" : "Protected zone";
}

function coloniaKeyToZoneLabel(key: string | null | undefined, lang: "es" | "en"): string | null {
  const k = String(key ?? "").trim();
  if (!k) return null;
  if (COLONIAS[k]) return coloniaLabel(k, lang);
  return coloniaLabel(k, lang);
}

export function rideRouteSummaryFromColoniaKeys(
  pickupColonia: string | null | undefined,
  dropoffColonia: string | null | undefined,
  lang: "es" | "en" = "es",
): RideRouteSummary {
  const pickup_zone = coloniaKeyToZoneLabel(pickupColonia, lang) ?? protectedZoneLabel(lang);
  const dropoff_zone = coloniaKeyToZoneLabel(dropoffColonia, lang) ?? protectedZoneLabel(lang);
  return {
    pickup_zone,
    dropoff_zone,
    route_label: `${pickup_zone} → ${dropoff_zone}`,
  };
}

export function rideRouteSummaryFromRow(
  row: { pickup_colonia?: string | null; dropoff_colonia?: string | null },
  lang: "es" | "en" = "es",
): RideRouteSummary {
  return rideRouteSummaryFromColoniaKeys(row.pickup_colonia, row.dropoff_colonia, lang);
}
