import type { Lang } from "@/lib/i18n-lang";

export type LiveSlotRow = { slot_start: string; slot_end: string };

const HORIZON_DAYS = 14;
const MAX_SLOTS = 64;

export async function fetchLiveSlotsViaRest(
  supaUrl: string,
  headers: Record<string, string>,
  listingId: string
): Promise<LiveSlotRow[]> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString();
  const q = new URLSearchParams({
    listing_id: `eq.${listingId}`,
    slot_end: `gte.${now}`,
    slot_start: `lte.${until}`,
    select: "slot_start,slot_end",
    order: "slot_start.asc",
    limit: String(MAX_SLOTS),
  });
  const res = await fetch(`${supaUrl}/rest/v1/listing_live_availability_slots?${q}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as LiveSlotRow[]) : [];
}

const TZ = "America/Mexico_City";

export function formatLiveSlotRange(slot_start: string, slot_end: string, lang: Lang): string {
  const s = new Date(slot_start);
  const e = new Date(slot_end);
  const dateFmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFmt.format(s)} · ${timeFmt.format(s)} – ${timeFmt.format(e)}`;
}

export function formatSyncedAt(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
