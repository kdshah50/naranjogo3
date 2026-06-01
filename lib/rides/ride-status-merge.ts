/**
 * Single source of truth for ride status ordering in client UI.
 * Polls/SSE must never replace a higher lifecycle step with a stale lower one.
 */

export const RIDE_STATUS_RANK: Record<string, number> = {
  requested: 0,
  matched: 1,
  accepted: 2,
  arrived: 3,
  in_trip: 4,
  completed: 5,
  cancelled: -1,
  disputed: -1,
};

export function rideStatusRank(status: string): number {
  return RIDE_STATUS_RANK[status] ?? 0;
}

export function isTerminalRideStatus(status: string): boolean {
  return status === "cancelled" || status === "completed" || status === "disputed";
}

export type RideStatusRow = { id: string; status: string; updated_at?: string | null };

/** Merge two rows for the same ride id; keeps the ahead status (never downgrade in-trip). */
export function mergeRideStatusRow<T extends RideStatusRow>(prev: T, next: T): T {
  if (prev.id === next.id) {
    if (isTerminalRideStatus(next.status)) return { ...prev, ...next };
    if (isTerminalRideStatus(prev.status)) return prev;
  }
  const rankNext = rideStatusRank(next.status);
  const rankPrev = rideStatusRank(prev.status);
  if (rankNext > rankPrev) return { ...prev, ...next };
  if (rankNext < rankPrev) return prev;
  const tPrev = prev.updated_at ?? "";
  const tNext = next.updated_at ?? "";
  return tNext >= tPrev ? { ...prev, ...next } : prev;
}

/** Merge lists by ride id; `localFirst` rows win ties before server poll data. */
export function mergeRideListsByStatus<T extends RideStatusRow>(
  localRows: T[],
  serverRows: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of [...localRows, ...serverRows]) {
    if (!row?.id) continue;
    const cur = byId.get(row.id);
    if (!cur) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, mergeRideStatusRow(cur, row));
  }
  return [...byId.values()];
}

/**
 * Driver panel poll/SSE: server list is authoritative for which trips exist.
 * Only merge lifecycle status per id — never keep local-only ghosts when server is empty.
 */
export function mergeDriverPanelTripList<T extends RideStatusRow>(
  localRows: T[],
  serverRows: T[],
): T[] {
  if (serverRows.length === 0) return [];
  const localById = new Map(localRows.map((row) => [row.id, row]));
  return serverRows.map((server) => {
    const local = localById.get(server.id);
    return local ? mergeRideStatusRow(local, server) : server;
  });
}
