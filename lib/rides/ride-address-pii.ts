import "server-only";

import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import {
  rideRouteSummaryFromColoniaKeys,
  rideRouteSummaryFromRow,
  type RideRouteSummary,
} from "@/lib/rides/ride-route-summary";

export type { RideRouteSummary };

export type RideRowWithAddresses = {
  pickup_address: string;
  dropoff_address: string;
  pickup_colonia?: string | null;
  dropoff_colonia?: string | null;
};

export function encryptRideAddressForStorage(plaintext: string): string {
  const text = String(plaintext ?? "").trim();
  if (!text) return text;
  return encryptPii(text);
}

export function decryptRideAddressFromStorage(stored: string): string {
  return decryptPii(String(stored ?? ""));
}

/** Decrypt pickup/dropoff after reading ride_bookings (legacy plaintext passthrough). */
export function normalizeRideRowAddressesFromDb<T extends RideRowWithAddresses>(row: T): T {
  return {
    ...row,
    pickup_address: decryptRideAddressFromStorage(row.pickup_address),
    dropoff_address: decryptRideAddressFromStorage(row.dropoff_address),
  };
}

/** List/history payloads — neighborhood zones only, never street addresses or coordinates. */
export type ClientRideHistoryRow = {
  id: string;
  status: string;
  ticket_code: string | null;
  pickup_zone: string;
  dropoff_zone: string;
  route_label: string;
  estimated_total_mxn_cents: number;
  final_total_mxn_cents?: number | null;
  updated_at?: string | null;
  created_at?: string;
};

export function toClientRideHistoryRow(
  row: RideRowWithAddresses & {
    id: string;
    status: string;
    ticket_code: string | null;
    estimated_total_mxn_cents: number;
    final_total_mxn_cents?: number | null;
    updated_at?: string | null;
    created_at?: string;
  },
  lang: "es" | "en" = "es",
): ClientRideHistoryRow {
  const summary = rideRouteSummaryFromRow(row, lang);
  return {
    id: row.id,
    status: row.status,
    ticket_code: row.ticket_code,
    pickup_zone: summary.pickup_zone,
    dropoff_zone: summary.dropoff_zone,
    route_label: summary.route_label,
    estimated_total_mxn_cents: row.estimated_total_mxn_cents,
    final_total_mxn_cents: row.final_total_mxn_cents ?? null,
    updated_at: row.updated_at ?? null,
    created_at: row.created_at,
  };
}

export function toClientRideCompletedSummary(
  row: Pick<RideRowWithAddresses, "pickup_colonia" | "dropoff_colonia"> & {
    id: string;
    status: string;
    ticket_code: string | null;
  },
  lang: "es" | "en" = "es",
): {
  id: string;
  status: string;
  ticket_code: string | null;
  route_label: string;
} {
  const summary = rideRouteSummaryFromRow(row, lang);
  return {
    id: row.id,
    status: row.status,
    ticket_code: row.ticket_code,
    route_label: summary.route_label,
  };
}

export { rideRouteSummaryFromColoniaKeys, rideRouteSummaryFromRow };
