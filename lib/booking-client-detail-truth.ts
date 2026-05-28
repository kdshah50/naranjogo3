import { canonicalBookingRowIdKey, mergeBookingListAvoidStatusRegression } from "@/lib/booking-list-merge";

const TERMINAL = new Set(["completed", "cancelled"]);

type RowWithId = { id: string; status?: string | null };

/**
 * List APIs merge several query branches and can briefly show `confirmed` after the DB row is
 * `completed`. GET /api/bookings/[id] reads the row directly — use it to fix open bookings on screen.
 */
export async function refreshOpenBookingsFromDetailApi<T extends RowWithId>(rows: T[]): Promise<T[]> {
  const open = rows.filter((r) => !TERMINAL.has(String(r.status ?? "").toLowerCase()));
  if (open.length === 0) return rows;

  const statusByKey = new Map<string, string>();
  await Promise.all(
    open.map(async (row) => {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(row.id)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        const st = String(data.status ?? "").trim();
        if (!st) return;
        statusByKey.set(canonicalBookingRowIdKey(row.id), st);
      } catch {
        /* non-fatal */
      }
    }),
  );

  if (statusByKey.size === 0) return rows;

  return rows.map((row) => {
    const st = statusByKey.get(canonicalBookingRowIdKey(row.id));
    return st ? { ...row, status: st } : row;
  });
}

/** Apply list merge then detail truth for open rows (seller + buyer dashboards). */
export async function mergeBookingsListWithDetailTruth<T extends RowWithId>(
  prev: T[],
  server: T[],
): Promise<T[]> {
  const merged = mergeBookingListAvoidStatusRegression(prev, server);
  return refreshOpenBookingsFromDetailApi(merged);
}

/** When the paid list is complete on screen, recompute banner stats from truth-corrected rows. */
export function sellerStatsFromTruthList(
  list: { status?: string | null }[],
  serverStats:
    | {
        sellerPaidBookings: number;
        sellerCompletedPaid: number;
        sellerActivePaidBookings: number;
      }
    | undefined,
):
  | {
      sellerPaidBookings: number;
      sellerCompletedPaid: number;
      sellerActivePaidBookings: number;
    }
  | null {
  if (!serverStats || serverStats.sellerPaidBookings <= 0) return serverStats ?? null;
  if (list.length !== serverStats.sellerPaidBookings) return serverStats;

  const completed = list.filter((b) => String(b.status ?? "").toLowerCase() === "completed").length;
  const cancelled = list.filter((b) => String(b.status ?? "").toLowerCase() === "cancelled").length;
  return {
    sellerPaidBookings: serverStats.sellerPaidBookings,
    sellerCompletedPaid: completed,
    sellerActivePaidBookings: Math.max(0, serverStats.sellerPaidBookings - completed - cancelled),
  };
}
