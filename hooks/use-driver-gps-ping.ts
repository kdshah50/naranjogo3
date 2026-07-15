"use client";

import { useEffect, useRef } from "react";

type UseDriverGpsPingArgs = {
  enabled: boolean;
  rideId?: string | null;
  intervalMs?: number;
};

/**
 * Periodic driver GPS ping while online or on an active trip.
 * Uses POST /api/rides/drivers/me/location (does not toggle online).
 */
export function useDriverGpsPing({
  enabled,
  rideId,
  intervalMs = 10_000,
}: UseDriverGpsPingArgs): void {
  const rideIdRef = useRef(rideId);
  useEffect(() => {
    rideIdRef.current = rideId;
  }, [rideId]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const body: Record<string, unknown> = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          const activeRideId = String(rideIdRef.current ?? "").trim();
          if (activeRideId) body.ride_id = activeRideId;

          void fetch("/api/rides/drivers/me/location", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).catch(() => {
            /* non-blocking */
          });
        },
        () => {
          /* permission denied or timeout — next interval retries */
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
      );
    };

    ping();
    timer = setInterval(ping, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}
