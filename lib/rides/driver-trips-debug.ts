import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDriverPanel } from "@/lib/rides/driver-panel-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export type DriverTripsDebugReport = {
  session_user_id: string;
  auth_phone_set: boolean;
  profile_user_id: string | null;
  profile_is_online: boolean | null;
  account_pool_size: number;
  trips_from_api: number;
  db_active_rides: Array<{
    id: string;
    status: string;
    ticket_code: string | null;
    driver_id: string;
    pickup_address: string;
    dropoff_address: string;
  }>;
  checks: string[];
};

export async function buildDriverTripsDebugReport(
  supabase: SupabaseClient,
  args: { sessionUserId: string; authPhone: string | null },
): Promise<DriverTripsDebugReport> {
  const checks: string[] = [];
  const panel = await loadDriverPanel(supabase, args);
  const profile = panel.driver;
  const pool = panel.canonical_user_id
    ? await expandUserAccountIdPool(supabase, panel.canonical_user_id, {
        authPhone: args.authPhone,
      })
    : [];

  if (!profile?.user_id) {
    checks.push(
      "No active driver profile for this session — log out at /unete and sign in with 415 181 6902.",
    );
  }
  if (!args.authPhone) {
    checks.push("JWT has no phone — re-login via OTP on /unete.");
  }

  const { data: dbRides } = await supabase
    .from("ride_bookings")
    .select("id,status,ticket_code,driver_id,pickup_address,dropoff_address,created_at")
    .in("status", ["matched", "accepted", "arrived", "in_trip"])
    .not("driver_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const dbRows = (dbRides ?? []).map((r) => ({
    id: String(r.id),
    status: String(r.status),
    ticket_code: r.ticket_code != null ? String(r.ticket_code) : null,
    driver_id: String(r.driver_id),
    pickup_address: String(r.pickup_address),
    dropoff_address: String(r.dropoff_address),
  }));

  const trips = panel.trips;

  if (dbRows.length > 0 && trips.length === 0 && profile?.user_id) {
    const assignedToProfile = dbRows.filter(
      (r) => r.driver_id.toLowerCase() === profile.user_id.toLowerCase(),
    );
    if (assignedToProfile.length > 0) {
      checks.push(
        `DB has ride(s) for ${profile.user_id.slice(0, 8)}… but panel returned 0 — tap refresh or open the WhatsApp link with ?ticket= again.`,
      );
    } else {
      checks.push("Rides assigned to a different driver_id — confirm you are logged in as Carme (415 181 6902).");
    }
  }
  if (trips.length > 0) {
    checks.push("Panel API OK — Accept ride on /conductor/viajes.");
  }
  if (dbRows.length === 0) {
    checks.push("No active rides in DB — rider should request a new trip on /viaje.");
  }

  return {
    session_user_id: args.sessionUserId,
    auth_phone_set: Boolean(args.authPhone),
    profile_user_id: profile?.user_id ?? null,
    profile_is_online: profile?.is_online ?? null,
    account_pool_size: pool.length,
    trips_from_api: trips.length,
    db_active_rides: dbRows,
    checks,
  };
}
