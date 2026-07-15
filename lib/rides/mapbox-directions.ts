import "server-only";

import { haversineEtaMinutes } from "@/lib/rides/ride-eta";

export type RideDirectionsResult = {
  distance_m: number;
  duration_s: number;
  eta_minutes: number;
  source: "mapbox" | "haversine";
  geometry: GeoJSON.LineString | null;
};

function mapboxAccessToken(): string | null {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  return token || null;
}

export async function fetchRideDirections(args: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}): Promise<RideDirectionsResult> {
  const fallback = haversineEtaMinutes(args.fromLat, args.fromLng, args.toLat, args.toLng);

  const token = mapboxAccessToken();
  if (!token) {
    return {
      ...fallback,
      source: "haversine",
      geometry: null,
    };
  }

  const coords = `${args.fromLng},${args.fromLat};${args.toLng},${args.toLat}`;
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.warn("[mapbox-directions] HTTP", res.status);
      return { ...fallback, source: "haversine", geometry: null };
    }
    const data = (await res.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: GeoJSON.LineString;
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.distance || !route.duration) {
      return { ...fallback, source: "haversine", geometry: null };
    }
    return {
      distance_m: Math.round(route.distance),
      duration_s: Math.round(route.duration),
      eta_minutes: Math.max(1, Math.ceil(route.duration / 60)),
      source: "mapbox",
      geometry: route.geometry ?? null,
    };
  } catch (err) {
    console.warn("[mapbox-directions] fetch failed", err);
    return { ...fallback, source: "haversine", geometry: null };
  }
}

export function isMapboxConfigured(): boolean {
  return Boolean(mapboxAccessToken());
}
