/**
 * PostgREST builds long `in.(…)` filters on GET requests; very large lists hit URL limits
 * and fail silently or error. Keep request-side chunks bounded.
 */
export const POSTGREST_IN_VALUE_CHUNK = 80;

export function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return items.length ? [[...items]] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
