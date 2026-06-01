/**
 * Client-side ride UI sync — monotonic status only, safe for poll/SSE/POST races.
 */

import { mergeRideStatusRow, type RideStatusRow } from "@/lib/rides/ride-status-merge";

export type { RideStatusRow };

export async function fetchRideRowById<T extends RideStatusRow>(
  rideId: string,
): Promise<T | null> {
  const id = String(rideId ?? "").trim();
  if (!id) return null;
  const r = await fetch(`/api/rides/${encodeURIComponent(id)}?_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return null;
  const data = (await r.json().catch(() => ({}))) as { ride?: T };
  return data.ride?.id ? data.ride : null;
}

/** Never downgrade lifecycle for the same ride id. */
export function applyMonotonicRideRow<T extends RideStatusRow>(
  current: T | null,
  incoming: T,
): T {
  if (!current || current.id !== incoming.id) return incoming;
  return mergeRideStatusRow(current, incoming);
}
