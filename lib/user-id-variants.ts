/**
 * JWT `sub` and Supabase `users.id` may differ only by UUID letter case.
 * PostgREST `.eq` on TEXT columns is case-sensitive — use `.in` with these variants.
 */
export function idMatchVariantsForIn(id: string): string[] {
  const t = id.trim();
  if (!t) return [];
  return Array.from(new Set([t, t.toLowerCase(), t.toUpperCase()]));
}

/** PostgREST filter: col=in.(a,b,c) */
export function postgrestInFilter(values: string[]): string {
  const v = [...new Set(values.filter(Boolean))];
  if (v.length === 0) return "";
  return `in.(${v.join(",")})`;
}
