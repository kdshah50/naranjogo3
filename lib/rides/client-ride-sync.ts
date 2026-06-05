/**
 * Client-side ride UI sync — server is source of truth via GET /api/rides/sync.
 */

import { mergeRideStatusRow, type RideStatusRow } from "@/lib/rides/ride-status-merge";

export type { RideStatusRow };

export type RideDriverPublic = {
  display_name: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_plates: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

export type RideSyncDriver = {
  user_id?: string;
  is_online: boolean;
  is_active_driver?: boolean;
};

export type RideSyncPayload = {
  ride: RideStatusRow | null;
  trips: RideStatusRow[];
  driver: RideSyncDriver | null;
  driver_public: RideDriverPublic | null;
  canonical_user_id: string | null;
  session_user_id?: string | null;
  auth_phone_set?: boolean;
  hide_tickets: string[];
  debug: {
    pool_size: number;
    drop_reason: string | null;
    source_ride_id?: string | null;
    raw_buyer_count: number;
    verified_buyer_count: number;
    status_code: number | null;
  };
};

export type RideSyncFetchResult =
  | { ok: true; payload: RideSyncPayload }
  | { ok: false; status: number };

export type DriverPanelPayload = {
  driver: RideSyncDriver | null;
  trips: RideStatusRow[];
  canonical_user_id: string | null;
  session_user_id?: string | null;
  auth_phone_set?: boolean;
  hide_tickets?: string[];
};

/** Driver panel load — dedicated endpoint (preferred for /conductor/viajes). */
export async function fetchDriverPanel(
  rideId?: string | null,
  ticketCode?: string | null,
): Promise<{ ok: true; payload: DriverPanelPayload } | { ok: false; status: number }> {
  const qs = new URLSearchParams();
  const id = String(rideId ?? "").trim();
  const ticket = String(ticketCode ?? "").trim();
  if (id) qs.set("ride_id", id);
  if (ticket) qs.set("ticket_code", ticket);
  const suffix = qs.toString() ? `?${qs}&` : "?";
  const r = await fetch(`/api/rides/drivers/me/panel${suffix}_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return { ok: false, status: r.status };
  const payload = (await r.json().catch(() => null)) as DriverPanelPayload | null;
  if (!payload) return { ok: false, status: r.status };
  return { ok: true, payload };
}

/** Fast ticket lookup for rider recover (event-hydrated, skips slow sync fallbacks). */
export async function fetchBuyerRecoverByTicket(
  ticketCode: string,
): Promise<
  | { ok: true; ride: RideStatusRow | null }
  | { ok: false; status: number }
> {
  const ticket = String(ticketCode ?? "").trim();
  if (!ticket) return { ok: false, status: 400 };
  const r = await fetch(
    `/api/rides/buyer/recover?ticket_code=${encodeURIComponent(ticket)}&_=${Date.now()}`,
    {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    },
  );
  if (!r.ok) return { ok: false, status: r.status };
  const payload = (await r.json().catch(() => null)) as { ride?: RideStatusRow | null } | null;
  return { ok: true, ride: payload?.ride ?? null };
}

/** Fast ticket lookup for driver recover button (skips slow panel fallbacks). */
export async function fetchDriverRecoverByTicket(
  ticketCode: string,
): Promise<
  | { ok: true; trips: RideStatusRow[]; ride: RideStatusRow | null }
  | { ok: false; status: number }
> {
  const ticket = String(ticketCode ?? "").trim();
  if (!ticket) return { ok: false, status: 400 };
  const r = await fetch(
    `/api/rides/drivers/me/recover?ticket_code=${encodeURIComponent(ticket)}&_=${Date.now()}`,
    {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    },
  );
  if (!r.ok) return { ok: false, status: r.status };
  const payload = (await r.json().catch(() => null)) as {
    trips?: RideStatusRow[];
    ride?: RideStatusRow | null;
  } | null;
  const trips = Array.isArray(payload?.trips) ? payload.trips : [];
  return { ok: true, trips, ride: payload?.ride ?? trips[0] ?? null };
}

/** Active rides fallback — as_driver array when panel list is empty. */
export async function fetchActiveDriverTrips(): Promise<RideStatusRow[]> {
  const r = await fetch(`/api/rides/active?_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return [];
  const data = (await r.json().catch(() => ({}))) as { as_driver?: RideStatusRow[] };
  return Array.isArray(data.as_driver) ? data.as_driver : [];
}

type ActiveBuyerPayload = {
  as_buyer_active?: RideStatusRow;
  as_buyer?: RideStatusRow[];
  as_buyer_display?: RideStatusRow;
};

async function fetchActiveBuyerPayload(): Promise<ActiveBuyerPayload | null> {
  const r = await fetch(`/api/rides/active?_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as ActiveBuyerPayload | null;
}

/** Active ride for rider UI when sync returns empty. */
export async function fetchActiveBuyerRide(): Promise<RideStatusRow | null> {
  const data = await fetchActiveBuyerPayload();
  if (!data) return null;
  if (data.as_buyer_active?.id) return data.as_buyer_active;
  const first = data.as_buyer?.[0];
  return first?.id ? first : null;
}

/** Latest completed buyer ride for terminal banner when sync has no open trip. */
export async function fetchBuyerCompletedDisplayRide(): Promise<RideStatusRow | null> {
  const data = await fetchActiveBuyerPayload();
  const display = data?.as_buyer_display;
  return display?.id && display.status === "completed" ? display : null;
}

/** Single sync load for rider + driver panels (Uber-style). */
export async function fetchRideSync(
  rideId?: string | null,
  ticketCode?: string | null,
  dismissedTicket?: string | null,
): Promise<RideSyncFetchResult> {
  const qs = new URLSearchParams();
  const id = String(rideId ?? "").trim();
  const ticket = String(ticketCode ?? "").trim();
  const dismissed = String(dismissedTicket ?? "").trim();
  if (id) qs.set("ride_id", id);
  if (ticket) qs.set("ticket_code", ticket);
  if (dismissed) qs.set("dismissed_ticket", dismissed);
  const suffix = qs.toString() ? `?${qs}&` : "?";
  const r = await fetch(`/api/rides/sync${suffix}_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return { ok: false, status: r.status };
  const payload = (await r.json().catch(() => null)) as RideSyncPayload | null;
  if (!payload) return { ok: false, status: r.status };
  return { ok: true, payload };
}

export function normalizeTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

/** Canonical row for a ticket (handles duplicate ride_bookings per NG- ticket). */
export async function fetchCanonicalRideByTicket<T extends RideStatusRow>(
  ticketCode: string,
): Promise<T | null> {
  const ticket = normalizeTicketCode(ticketCode);
  if (!ticket) return null;
  const r = await fetch(
    `/api/rides/active?ticket_code=${encodeURIComponent(ticket)}&_=${Date.now()}`,
    {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    },
  );
  if (!r.ok) return null;
  const data = (await r.json().catch(() => ({}))) as { canonical_by_ticket?: T };
  return data.canonical_by_ticket?.id ? data.canonical_by_ticket : null;
}

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
