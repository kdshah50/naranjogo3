import "server-only";

/**
 * PostgREST headers for server-side calls that must bypass RLS.
 * The anon key must not be used for table access after RLS is enabled (no public policies).
 */
export function getSupabaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  return u;
}

export function getServiceRoleRestHeaders(): { apikey: string; Authorization: string } {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required (RLS: tables are closed to the anon key).");
  }
  return { apikey: k, Authorization: `Bearer ${k}` };
}
