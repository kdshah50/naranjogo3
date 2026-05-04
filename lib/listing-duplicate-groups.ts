/**
 * Heuristic duplicate detection: same seller + normalized title + price, or same seller + first photo + price.
 * Used for admin triage and soft search ranking penalties (not automatic takedowns).
 */

export type DedupeListRow = {
  id: string;
  seller_id: string;
  title_es: string;
  price_mxn: number;
  photo_urls: unknown;
  created_at: string;
};

export type SuspectedDuplicateGroup = {
  reason: "title_price" | "photo_price";
  key: string;
  listings: DedupeListRow[];
};

export function normalizeListingTitleForDedupe(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function firstPhotoUrl(photo_urls: unknown): string | null {
  if (!Array.isArray(photo_urls) || photo_urls.length === 0) return null;
  const u = photo_urls[0];
  return typeof u === "string" && u.trim().length > 0 ? u.trim() : null;
}

function sortByCreatedAsc(listings: DedupeListRow[]) {
  return [...listings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/** Minimum normalized title length to form a title+price group (avoid noisy short strings). */
const MIN_TITLE_KEY_LEN = 8;

/**
 * Groups by seller + normalized title + price (admin + search penalty).
 */
export function groupByTitlePrice(rows: DedupeListRow[]): SuspectedDuplicateGroup[] {
  const titleMap = new Map<string, DedupeListRow[]>();
  for (const row of rows) {
    if (!row.seller_id) continue;
    const nt = normalizeListingTitleForDedupe(row.title_es ?? "");
    if (nt.length < MIN_TITLE_KEY_LEN) continue;
    const tk = `${row.seller_id}|${nt}|${row.price_mxn}`;
    const arr = titleMap.get(tk) ?? [];
    arr.push(row);
    titleMap.set(tk, arr);
  }
  const groups: SuspectedDuplicateGroup[] = [];
  for (const [key, listings] of titleMap) {
    if (listings.length >= 2) {
      groups.push({ reason: "title_price", key, listings: sortByCreatedAsc(listings) });
    }
  }
  return groups;
}

/**
 * Groups by seller + first photo URL + price (often cross-post / copy-paste).
 */
export function groupByPhotoPrice(rows: DedupeListRow[]): SuspectedDuplicateGroup[] {
  const photoMap = new Map<string, DedupeListRow[]>();
  for (const row of rows) {
    if (!row.seller_id) continue;
    const ph = firstPhotoUrl(row.photo_urls);
    if (!ph) continue;
    const pk = `${row.seller_id}|${ph}|${row.price_mxn}`;
    const arr = photoMap.get(pk) ?? [];
    arr.push(row);
    photoMap.set(pk, arr);
  }
  const groups: SuspectedDuplicateGroup[] = [];
  for (const [key, listings] of photoMap) {
    if (listings.length < 2) continue;
    const seen = new Set<string>();
    const unique = listings.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    if (unique.length >= 2) {
      groups.push({ reason: "photo_price", key, listings: sortByCreatedAsc(unique) });
    }
  }
  return groups;
}

export function allSuspectedDuplicateGroups(rows: DedupeListRow[]): SuspectedDuplicateGroup[] {
  return [...groupByTitlePrice(rows), ...groupByPhotoPrice(rows)];
}

/**
 * Non-canonical listings (newer than oldest in group) get `penalty` multiplier on _score.
 */
export function duplicateScoreMultiplierById(
  rows: Array<{
    id: string;
    seller_id?: string | null;
    title_es?: string;
    price_mxn?: number;
    photo_urls?: unknown;
    created_at?: string;
  }>,
  penalty: number,
): Map<string, number> {
  const mult = new Map<string, number>();
  for (const r of rows) mult.set(String(r.id), 1);

  const dedupeRows: DedupeListRow[] = rows
    .filter((r) => r.seller_id && r.created_at)
    .map((r) => ({
      id: String(r.id),
      seller_id: String(r.seller_id),
      title_es: String(r.title_es ?? ""),
      price_mxn: Number(r.price_mxn) || 0,
      photo_urls: r.photo_urls,
      created_at: String(r.created_at),
    }));

  const groups = groupByTitlePrice(dedupeRows);
  for (const g of groups) {
    const [, ...rest] = g.listings;
    for (const x of rest) {
      const id = x.id;
      mult.set(id, Math.min(mult.get(id) ?? 1, penalty));
    }
  }
  return mult;
}
