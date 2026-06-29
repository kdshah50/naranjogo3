import { normalizeNgTicketQuery } from "@/lib/ng-ticket-normalize";

const STORAGE_KEY = "tianguis:seller-tickets";
const MAX_TICKETS = 24;

/** Persist NG- ticket codes on this device so /seller-bookings finds them without ?ticket= in the URL. */
export function rememberSellerTicket(raw: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const code = normalizeNgTicketQuery(raw);
  if (!code) return;
  try {
    const prev = loadSellerKnownTickets();
    const next = [code, ...prev.filter((t) => t !== code)].slice(0, MAX_TICKETS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
}

export function loadSellerKnownTickets(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      const code = normalizeNgTicketQuery(String(item ?? ""));
      if (code && !out.includes(code)) out.push(code);
    }
    return out.slice(0, MAX_TICKETS);
  } catch {
    return [];
  }
}

/** Tickets to send on GET /api/bookings?seller=1 (URL hint first, then remembered on device). */
export function ticketsForSellerApiQuery(urlTicket: string | null | undefined): string[] {
  const primary = normalizeNgTicketQuery(urlTicket);
  const merged = new Set<string>();
  if (primary) merged.add(primary);
  for (const t of loadSellerKnownTickets()) merged.add(t);
  return [...merged];
}
