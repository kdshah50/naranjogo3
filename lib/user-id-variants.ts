/**
 * JWT `sub` and Supabase `users.id` may differ only by UUID letter case.
 * PostgREST `.eq` on TEXT columns is case-sensitive — use `.in` with these variants.
 */
export function idMatchVariantsForIn(id: string): string[] {
  const t = id.trim();
  if (!t) return [];
  return Array.from(new Set([t, t.toLowerCase(), t.toUpperCase()]));
}

/** `driver_profiles.user_id` is TEXT — normalize case for PostgREST `.in` filters. */
export function driverProfileUserIdVariants(id: string): string[] {
  return [...new Set(idMatchVariantsForIn(id).map((v) => v.toLowerCase()))];
}

/** When `.in("id", pool)` returns merged accounts, prefer the row matching the booking’s canonical user id. */
export function sortRowsWithPreferredUserId<T extends { id: string }>(rows: T[], preferredUserId: string): T[] {
  const pref = new Set(idMatchVariantsForIn(String(preferredUserId)));
  return [...rows].sort((a, b) => {
    const ap = pref.has(String(a.id)) ? 0 : 1;
    const bp = pref.has(String(b.id)) ? 0 : 1;
    return ap - bp;
  });
}

/** PostgREST filter: col=in.(a,b,c) */
export function postgrestInFilter(values: string[]): string {
  const v = [...new Set(values.filter(Boolean))];
  if (v.length === 0) return "";
  return `in.(${v.join(",")})`;
}
