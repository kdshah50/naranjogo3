import { canonicalBookingRowIdKey, mergeBookingListAvoidStatusRegression } from "@/lib/booking-list-merge";

const TERMINAL = new Set(["completed", "cancelled"]);

type RowWithId = {
  id: string;
  status?: string | null;
  ticket_code?: string | null;
  paid_at?: string | null;
};

/**
 * List APIs merge several query branches and can briefly show `confirmed` after the DB row is
 * `completed`. GET /api/bookings/[id] reads the row directly — use it to fix rows on screen.
 */
export async function refreshOpenBookingsFromDetailApi<T extends RowWithId>(
  rows: T[],
  opts?: { includeTerminal?: boolean },
): Promise<T[]> {
  const toRefresh = rows.filter((r) => {
    if (!String(r.ticket_code ?? "").trim()) return true;
    if (opts?.includeTerminal) return true;
    return !TERMINAL.has(String(r.status ?? "").toLowerCase());
  });
  if (toRefresh.length === 0) return rows;

  const patchByKey = new Map<string, { status?: string; ticket_code?: string | null; paid_at?: string | null }>();
  await Promise.all(
    toRefresh.map(async (row) => {
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(row.id)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          status?: string;
          ticket_code?: string | null;
          ticketCode?: string | null;
          paid_at?: string | null;
          paidAt?: string | null;
        };
        const st = String(data.status ?? "").trim();
        const tk = (data.ticket_code ?? data.ticketCode)?.trim() || null;
        const paid = data.paid_at ?? data.paidAt ?? null;
        if (!st && !tk && !paid) return;
        patchByKey.set(canonicalBookingRowIdKey(row.id), {
          ...(st ? { status: st } : {}),
          ...(tk ? { ticket_code: tk } : {}),
          ...(paid ? { paid_at: paid } : {}),
        });
      } catch {
        /* non-fatal */
      }
    }),
  );

  if (patchByKey.size === 0) return rows;

  return rows.map((row) => {
    const patch = patchByKey.get(canonicalBookingRowIdKey(row.id));
    if (!patch) return row;
    return {
      ...row,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.ticket_code ? { ticket_code: patch.ticket_code } : {}),
      ...(patch.paid_at && !row.paid_at ? { paid_at: patch.paid_at } : {}),
    };
  });
}

/** Apply list merge then detail truth for open rows (seller + buyer dashboards). */
export async function mergeBookingsListWithDetailTruth<T extends RowWithId>(
  prev: T[],
  server: T[],
  opts?: { includeTerminal?: boolean },
): Promise<T[]> {
  const merged = mergeBookingListAvoidStatusRegression(prev, server);
  return refreshOpenBookingsFromDetailApi(merged, opts);
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
