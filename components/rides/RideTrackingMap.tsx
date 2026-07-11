"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { RideDriverPublic } from "@/lib/rides/client-ride-sync";
import {
  formatEtaMinutes,
  haversineEtaMinutes,
  isDriverLocationFresh,
} from "@/lib/rides/ride-eta";

type Props = {
  rideId: string;
  rideStatus: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  driver: RideDriverPublic | null;
  lang: "es" | "en";
};

type DirectionsPayload = {
  eta_minutes: number;
  source: "mapbox" | "haversine";
  geometry: GeoJSON.LineString | null;
  target: "pickup" | "dropoff";
};

const TRACKING_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);

export default function RideTrackingMap({
  rideId,
  rideStatus,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  driver,
  lang,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const routeLayerRef = useRef<unknown>(null);
  const [etaLabel, setEtaLabel] = useState<string | null>(null);
  const [staleGps, setStaleGps] = useState(false);
  const [mapMode, setMapMode] = useState<"mapbox" | "leaflet" | null>(null);

  const driverLat = driver?.last_lat ?? null;
  const driverLng = driver?.last_lng ?? null;
  const showTracking = TRACKING_STATUSES.has(rideStatus);

  useEffect(() => {
    setStaleGps(!isDriverLocationFresh(driver?.last_location_at));
  }, [driver?.last_location_at]);

  useEffect(() => {
    if (!showTracking || driverLat == null || driverLng == null) {
      setEtaLabel(null);
      return;
    }

    let toLat = pickupLat;
    let toLng = pickupLng;
    if (rideStatus === "in_trip") {
      toLat = dropoffLat;
      toLng = dropoffLng;
    }

    const fallback = haversineEtaMinutes(driverLat, driverLng, toLat, toLng);
    setEtaLabel(formatEtaMinutes(fallback.eta_minutes, lang));

    const qs = new URLSearchParams({
      driver_lat: String(driverLat),
      driver_lng: String(driverLng),
    });

    void fetch(`/api/rides/${encodeURIComponent(rideId)}/directions?${qs}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DirectionsPayload | null) => {
        if (!data?.eta_minutes) return;
        setEtaLabel(formatEtaMinutes(data.eta_minutes, lang));
        if (data.geometry && mapRef.current) {
          drawRoute(mapRef.current, mapMode, data.geometry, routeLayerRef);
        }
      })
      .catch(() => {
        /* haversine fallback already set */
      });
  }, [
    showTracking,
    driverLat,
    driverLng,
    rideStatus,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    rideId,
    lang,
    mapMode,
  ]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();

    void (async () => {
      if (mapboxToken) {
        try {
          const mapboxgl = (await import("mapbox-gl")).default;
          await import("mapbox-gl/dist/mapbox-gl.css");
          mapboxgl.accessToken = mapboxToken;
          const map = new mapboxgl.Map({
            container: mapEl.current!,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [pickupLng, pickupLat],
            zoom: 13,
          });
          mapRef.current = map;
          setMapMode("mapbox");
          map.on("load", () => updateMarkers(map, "mapbox", markersRef, {
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            driverLat,
            driverLng,
          }));
          return;
        } catch {
          /* fall through to Leaflet */
        }
      }

      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      const map = L.map(mapEl.current!).setView([pickupLat, pickupLng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
      setMapMode("leaflet");
      updateMarkers(map, "leaflet", markersRef, {
        pickupLat,
        pickupLng,
        dropoffLat,
        dropoffLng,
        driverLat,
        driverLng,
      });
    })();

    return () => {
      if (mapRef.current && mapMode === "leaflet") {
        (mapRef.current as { remove: () => void }).remove();
      } else if (mapRef.current && mapMode === "mapbox") {
        (mapRef.current as { remove: () => void }).remove();
      }
      mapRef.current = null;
      markersRef.current = [];
      routeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapMode) return;
    updateMarkers(mapRef.current, mapMode, markersRef, {
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      driverLat,
      driverLng,
    });
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, driverLat, driverLng, mapMode]);

  if (!showTracking) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[#1B4332]/15">
      <div ref={mapEl} className="h-52 w-full bg-[#E8E4DC]" aria-label={lang === "es" ? "Mapa del viaje" : "Trip map"} />
      <div className="flex flex-wrap items-center gap-2 border-t border-[#1B4332]/10 bg-[#F8F4ED] px-3 py-2 text-xs text-[#1B4332]/80">
        {etaLabel && driverLat != null && rideStatus !== "matched" && (
          <span className="font-semibold text-[#1B4332]">
            {lang === "es" ? "Llegada estimada" : "ETA"} {etaLabel}
          </span>
        )}
        {rideStatus === "matched" && (
          <span>{lang === "es" ? "Conductor asignado — esperando aceptación" : "Driver assigned — awaiting accept"}</span>
        )}
        {staleGps && driverLat != null && (
          <span className="text-amber-800">
            {lang === "es" ? "Ubicación desactualizada" : "Location may be stale"}
          </span>
        )}
        {!driverLat && (
          <span>{lang === "es" ? "Esperando ubicación del conductor…" : "Waiting for driver location…"}</span>
        )}
      </div>
    </div>
  );
}

function updateMarkers(
  map: unknown,
  mode: "mapbox" | "leaflet" | null,
  markersRef: MutableRefObject<unknown[]>,
  coords: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    driverLat: number | null;
    driverLng: number | null;
  },
) {
  if (!map || !mode) return;

  if (mode === "leaflet") {
    const L = require("leaflet") as typeof import("leaflet");
    const leafletMap = map as import("leaflet").Map;
    for (const m of markersRef.current) {
      (m as import("leaflet").Marker).remove();
    }
    markersRef.current = [];
    const group: import("leaflet").Layer[] = [];
    group.push(
      L.marker([coords.pickupLat, coords.pickupLng]).bindTooltip("Origen").addTo(leafletMap),
    );
    group.push(
      L.marker([coords.dropoffLat, coords.dropoffLng]).bindTooltip("Destino").addTo(leafletMap),
    );
    if (coords.driverLat != null && coords.driverLng != null) {
      group.push(
        L.circleMarker([coords.driverLat, coords.driverLng], {
          radius: 8,
          color: "#1B4332",
          fillColor: "#40916C",
          fillOpacity: 0.9,
        })
          .bindTooltip("Conductor")
          .addTo(leafletMap),
      );
    }
    markersRef.current = group;
    const bounds: [number, number][] = [
      [coords.pickupLat, coords.pickupLng],
      [coords.dropoffLat, coords.dropoffLng],
    ];
    if (coords.driverLat != null && coords.driverLng != null) {
      bounds.push([coords.driverLat, coords.driverLng]);
    }
    leafletMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    return;
  }

  const mapboxMap = map as import("mapbox-gl").Map;
  const mapboxgl = require("mapbox-gl") as typeof import("mapbox-gl");
  for (const m of markersRef.current) {
    (m as import("mapbox-gl").Marker).remove();
  }
  markersRef.current = [];
  const markers: import("mapbox-gl").Marker[] = [];
  markers.push(
    new mapboxgl.Marker({ color: "#40916C" })
      .setLngLat([coords.pickupLng, coords.pickupLat])
      .setPopup(new mapboxgl.Popup().setText("Origen"))
      .addTo(mapboxMap),
  );
  markers.push(
    new mapboxgl.Marker({ color: "#E76F51" })
      .setLngLat([coords.dropoffLng, coords.dropoffLat])
      .setPopup(new mapboxgl.Popup().setText("Destino"))
      .addTo(mapboxMap),
  );
  if (coords.driverLat != null && coords.driverLng != null) {
    markers.push(
      new mapboxgl.Marker({ color: "#1B4332" })
        .setLngLat([coords.driverLng, coords.driverLat])
        .setPopup(new mapboxgl.Popup().setText("Conductor"))
        .addTo(mapboxMap),
    );
  }
  markersRef.current = markers;

  const lngs = [coords.pickupLng, coords.dropoffLng];
  const lats = [coords.pickupLat, coords.dropoffLat];
  if (coords.driverLng != null && coords.driverLat != null) {
    lngs.push(coords.driverLng);
    lats.push(coords.driverLat);
  }
  mapboxMap.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 40, maxZoom: 15 },
  );
}

function drawRoute(
  map: unknown,
  mode: "mapbox" | "leaflet" | null,
  geometry: GeoJSON.LineString,
  routeLayerRef: MutableRefObject<unknown>,
) {
  if (!map || !geometry?.coordinates?.length) return;

  if (mode === "mapbox") {
    const mapboxMap = map as import("mapbox-gl").Map;
    const sourceId = "ride-route";
    const layerId = "ride-route-line";
    if (mapboxMap.getLayer(layerId)) mapboxMap.removeLayer(layerId);
    if (mapboxMap.getSource(sourceId)) mapboxMap.removeSource(sourceId);
    mapboxMap.addSource(sourceId, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry },
    });
    mapboxMap.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#40916C", "line-width": 4, "line-opacity": 0.85 },
    });
    routeLayerRef.current = layerId;
    return;
  }

  if (mode === "leaflet") {
    const L = require("leaflet") as typeof import("leaflet");
    const leafletMap = map as import("leaflet").Map;
    if (routeLayerRef.current) {
      (routeLayerRef.current as import("leaflet").Polyline).remove();
    }
    const latlngs = geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    const line = L.polyline(latlngs, { color: "#40916C", weight: 4, opacity: 0.85 }).addTo(leafletMap);
    routeLayerRef.current = line;
  }
}
