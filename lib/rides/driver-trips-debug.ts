import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  driverRideAccountIdPool,
  findActiveDriverProfileForAccount,
} from "@/lib/rides/driver-account";
import { listActiveTripsForDriver } from "@/lib/rides/ride-trip-server";

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
  const accountOpts = { authPhone: args.authPhone };

  const profile = await findActiveDriverProfileForAccount(
    supabase,
    args.sessionUserId,
    accountOpts,
  );
  const pool = profile
    ? await driverRideAccountIdPool(supabase, args.sessionUserId, accountOpts)
    : [];

  if (!profile?.user_id) {
    checks.push(
      "No active driver profile for this session — log out at /unete and sign in with driver WhatsApp (415 181 6902).",
    );
  }
  if (!args.authPhone) {
    checks.push("JWT has no phone — duplicate-user linking may fail. Re-login via OTP.");
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

  const trips = profile
    ? await listActiveTripsForDriver(supabase, args.sessionUserId, accountOpts)
    : [];

  if (dbRows.length > 0 && trips.length === 0 && profile?.user_id) {
    const assignedToProfile = dbRows.filter(
      (r) => r.driver_id.toLowerCase() === profile.user_id.toLowerCase(),
    );
    if (assignedToProfile.length > 0) {
      checks.push(
        `DB has ${assignedToProfile.length} active ride(s) for profile ${profile.user_id.slice(0, 8)}… but trips API returned 0 — redeploy preview or hard-refresh.`,
      );
    } else {
      checks.push(
        `Active rides exist but driver_id is not ${profile.user_id.slice(0, 8)}… — duplicate-user / wrong driver assignment.`,
      );
    }
  }
  if (trips.length > 0) {
    checks.push("Trips API OK — panel should list assigned rides after refresh.");
  }
  if (dbRows.length === 0) {
    checks.push("No matched+ rides in DB — rider request may not have completed match.");
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
