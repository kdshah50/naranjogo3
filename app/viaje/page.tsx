"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useAppLang } from "@/hooks/use-app-lang";
import { COLONIA_KEYS, COLONIAS, coloniaLabel } from "@/lib/colonias";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
import {
  applyMonotonicRideRow,
  fetchBuyerRideStatus,
  fetchCanonicalRideByTicket,
  fetchRideRowById,
  fetchRideSync,
  type RideDriverPublic,
} from "@/lib/rides/client-ride-sync";
import { mergeRideStatusRow, rideStatusRank } from "@/lib/rides/ride-status-merge";
import { rideStatusToCode } from "@/lib/rides/ride-status-codes";
import { rideStatusLabel, viajeCopy } from "@/lib/rides/ui-copy";

type FareEstimate = {
  distance_m: number;
  duration_s: number;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
  surge_multiplier: number;
};

type RideRow = {
  id: string;
  status: string;
  status_code?: number;
  pickup_address: string;
  dropoff_address: string;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
  final_total_mxn_cents?: number | null;
  ticket_code: string | null;
  driver_id: string | null;
  passengers?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const COLONIAS_LIST = COLONIA_KEYS.map((key) => ({
  value: key,
  label: COLONIAS[key].label,
}));

const VIAJE_PINNED_RIDE_KEY = "ng_viaje_pinned_ride_id";
const VIAJE_ACTIVE_TICKET_KEY = "ng_viaje_active_ticket";
const VIAJE_TERMINAL_RIDE_KEY = "ng_viaje_terminal_ride_id";
const VIAJE_USER_CLEARED_UNTIL_KEY = "ng_viaje_user_cleared_until";
const VIAJE_DISMISSED_TICKET_KEY = "ng_viaje_dismissed_ticket";

function readDismissedTicket(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const t = sessionStorage.getItem(VIAJE_DISMISSED_TICKET_KEY)?.trim();
  return t ? normalizeTicketKey(t) : null;
}

function writeDismissedTicket(ticket: string | null) {
  if (typeof sessionStorage === "undefined") return;
  const key = normalizeTicketKey(ticket);
  if (key) sessionStorage.setItem(VIAJE_DISMISSED_TICKET_KEY, key);
  else sessionStorage.removeItem(VIAJE_DISMISSED_TICKET_KEY);
}

function clearDismissedTicket() {
  writeDismissedTicket(null);
}

function readUserClearedUntil(): number {
  if (typeof sessionStorage === "undefined") return 0;
  const v = sessionStorage.getItem(VIAJE_USER_CLEARED_UNTIL_KEY);
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) && n > Date.now() ? n : 0;
}

function writeUserClearedUntil(until: number) {
  if (typeof sessionStorage === "undefined") return;
  if (until > 0) sessionStorage.setItem(VIAJE_USER_CLEARED_UNTIL_KEY, String(until));
  else sessionStorage.removeItem(VIAJE_USER_CLEARED_UNTIL_KEY);
}

const POLL_SOURCES = new Set([
  "poll",
  "mount",
  "focus",
  "pageshow",
  "manual",
  "poll-backup",
  "clear",
]);

const BUYER_ACTIVE_STATUSES = new Set([
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
]);

function isTerminalRideStatus(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

function isBuyerActiveStatus(status: string): boolean {
  return BUYER_ACTIVE_STATUSES.has(status);
}

function normalizeTicketKey(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

function isTicketLatched(
  ticket: string | null | undefined,
  latch: { ticket: string; until: number } | null,
): boolean {
  if (!latch || Date.now() >= latch.until) return false;
  return normalizeTicketKey(ticket) === normalizeTicketKey(latch.ticket);
}

function pinRideId(rideId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VIAJE_PINNED_RIDE_KEY, rideId);
}

function clearPinnedRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VIAJE_PINNED_RIDE_KEY);
}

function readPinnedTicket(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const t = sessionStorage.getItem(VIAJE_ACTIVE_TICKET_KEY)?.trim();
  return t ? normalizeTicketKey(t) : null;
}

function pinActiveTicket(ticket: string | null | undefined) {
  if (typeof sessionStorage === "undefined") return;
  const key = normalizeTicketKey(ticket);
  if (key) sessionStorage.setItem(VIAJE_ACTIVE_TICKET_KEY, key);
  else sessionStorage.removeItem(VIAJE_ACTIVE_TICKET_KEY);
}

function clearPinnedTicket() {
  pinActiveTicket(null);
}

function pinTerminalRideId(rideId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VIAJE_TERMINAL_RIDE_KEY, rideId);
  sessionStorage.removeItem(VIAJE_PINNED_RIDE_KEY);
}

function readTerminalRideId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(VIAJE_TERMINAL_RIDE_KEY)?.trim();
  return id || null;
}

function clearTerminalRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VIAJE_TERMINAL_RIDE_KEY);
}

function stripRideIdFromBrowserUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hadRide = url.searchParams.has("ride");
  const hadTicket = url.searchParams.has("ticket");
  if (!hadRide && !hadTicket) return;
  if (hadRide) url.searchParams.delete("ride");
  if (hadTicket) url.searchParams.delete("ticket");
  window.history.replaceState(null, "", url.toString());
}

type SyncDebug = {
  source: string;
  at: string;
  apiSummary: string;
  uiStatus: string;
  uiTicket: string;
  mismatch: boolean;
  dropReason?: string | null;
};

function formatRiderSyncDebug(d: SyncDebug): string {
  const flag = d.mismatch ? " · UI MISMATCH" : "";
  return `Active API: ${d.apiSummary} · UI: ${d.uiStatus}${d.uiTicket ? ` · ${d.uiTicket}` : ""}${flag} · ${d.source} ${d.at}`;
}

function syncDebugForRow(
  row: RideRow | null,
  source: string,
  note?: string,
  dropReason?: string | null,
): SyncDebug {
  let apiSummary = note ?? "0 open";
  if (row) {
    const code = row.status_code != null ? ` #${row.status_code}` : "";
    apiSummary = isBuyerActiveStatus(row.status)
      ? `1 open · ${row.status}${code}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`
      : `not open · ${row.status}${code}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`;
  }
  return {
    source,
    at: new Date().toLocaleTimeString(),
    apiSummary,
    uiStatus: row?.status ?? "none",
    uiTicket: row?.ticket_code ?? "",
    mismatch: false,
    dropReason: dropReason ?? null,
  };
}

function readPinnedRideId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(VIAJE_PINNED_RIDE_KEY)?.trim();
  return id || null;
}

/** Duplicate NG- rows share a ticket — follow highest lifecycle row (WhatsApp links pin stale ids). */
async function resolveRowByTicketCanonical(row: RideRow): Promise<RideRow> {
  const ticket = normalizeTicketKey(row.ticket_code);
  if (!ticket) return row;

  const canonical = await fetchCanonicalRideByTicket<RideRow>(ticket);
  if (!canonical?.id) return row;

  const merged = mergeRideStatusRow(row, canonical);
  if (rideStatusRank(canonical.status) >= rideStatusRank(row.status)) {
    return { ...merged, id: canonical.id, status: canonical.status };
  }
  return merged;
}

function repinCanonicalRideId(
  row: RideRow,
  rideIdRef: { current: string | null },
  activeTicketRef: { current: string | null },
) {
  if (!row?.id) return;
  pinRideId(row.id);
  rideIdRef.current = row.id;
  const ticket = normalizeTicketKey(row.ticket_code);
  if (ticket) {
    activeTicketRef.current = ticket;
    pinActiveTicket(ticket);
  }
}


const SYNC_DISCOVERY_SOURCES = new Set([
  "request",
  "mount",
  "mount-retry",
  "manual",
  "recover",
  "clear",
  "cancel",
  "active-ride-block",
  "post-request",
]);

/** Authoritative rider read — ride_events via /api/rides/buyer/status. */
async function fetchBuyerRideTruth(
  ticket: string | null | undefined,
  rideId: string | null | undefined,
): Promise<{
  ride: RideRow | null;
  driver_public: RideDriverPublic | null;
  httpStatus: number;
}> {
  const result = await fetchBuyerRideStatus(ticket, rideId);
  if (result.ok) {
    if (result.payload.ride?.id) {
      return {
        ride: result.payload.ride as RideRow,
        driver_public: result.payload.driver_public ?? null,
        httpStatus: 200,
      };
    }
    return { ride: null, driver_public: null, httpStatus: 200 };
  }
  return { ride: null, driver_public: null, httpStatus: result.status };
}

export default function ViajePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8F4ED] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
        </main>
      }
    >
      <ViajePageInner />
    </Suspense>
  );
}

function ViajePageInner() {
  const lang = useAppLang();
  const t = viajeCopy(lang);
  const rideIdRef = useRef<string | null>(null);
  /** WhatsApp deep-link ticket — resolves canonical row even when ride id is stale. */
  const urlTicketRef = useRef<string | null>(null);
  /** Active trip ticket — sent on every sync so server resolves highest lifecycle row. */
  const activeTicketRef = useRef<string | null>(null);
  const requestLatchUntilRef = useRef(0);
  const refreshSeqRef = useRef(0);
  /** Polls must not downgrade lifecycle after driver accepts / trip progresses. */
  const statusFloorByRideRef = useRef<Map<string, number>>(new Map());
  /** Ignore ghost duplicate rows for this ticket after trip completes. */
  const completedTicketLatchRef = useRef<{ ticket: string; until: number } | null>(null);
  /** True when page was opened from a WhatsApp link (?ride= or ?ticket= in URL). */
  const hadUrlRideParamsRef = useRef(false);
  /** Set when user explicitly clears the ride screen — prevents completed ride from reappearing via poll. Persisted to sessionStorage so page refresh also respects it. */
  const userClearedUntilRef = useRef(readUserClearedUntil());

  const [pickupColonia, setPickupColonia] = useState("centro");
  const [dropoffColonia, setDropoffColonia] = useState("guadalupe");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [passengers, setPassengers] = useState(1);

  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [ride, setRide] = useState<RideRow | null>(null);
  const [terminalBanner, setTerminalBanner] = useState<RideRow | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [tipMxn, setTipMxn] = useState(20);

  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionPhone, setSessionPhone] = useState<string | null>(null);
  const [syncDebug, setSyncDebug] = useState<SyncDebug | null>(null);
  const [driverPublic, setDriverPublic] = useState<RideDriverPublic | null>(null);
  const [recoverTicketInput, setRecoverTicketInput] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  /** Mirrors ride state — polls must not wipe an active trip on transient empty sync. */
  const uiRideRef = useRef<RideRow | null>(null);

  const mergeIncomingBuyerRide = useCallback(
    (prev: RideRow | null, incoming: RideRow): RideRow => {
      const sameTicket =
        prev?.ticket_code &&
        incoming.ticket_code &&
        normalizeTicketKey(prev.ticket_code) === normalizeTicketKey(incoming.ticket_code);
      const sameId = prev?.id === incoming.id;

      let merged: RideRow;
      if (sameId) {
        merged = mergeRideStatusRow(prev!, incoming);
      } else if (sameTicket && prev) {
        const ahead =
          rideStatusRank(incoming.status) >= rideStatusRank(prev.status) ? incoming : prev;
        const behind = ahead === incoming ? prev : incoming;
        merged = { ...mergeRideStatusRow(behind, ahead), id: ahead.id };
      } else {
        merged = incoming;
      }

      const floor = statusFloorByRideRef.current.get(merged.id);
      if (floor !== undefined && rideStatusRank(merged.status) < floor) {
        if (sameId && prev) merged = prev;
      }
      const nextFloor = Math.max(floor ?? 0, rideStatusRank(merged.status));
      statusFloorByRideRef.current.set(merged.id, nextFloor);
      return merged;
    },
    [],
  );

  const applyServerRide = useCallback(
    (row: RideRow | null, source: string, note?: string, dropReason?: string | null) => {
    // User explicitly cleared — don't let a completed ride resurface via poll.
    if (row && isTerminalRideStatus(row.status) && Date.now() < userClearedUntilRef.current) {
      setSyncDebug(syncDebugForRow(null, source, note ?? "user-cleared", dropReason));
      return;
    }
    if (row && isTerminalRideStatus(row.status)) {
      statusFloorByRideRef.current.delete(row.id);
      requestLatchUntilRef.current = 0;
      if (row.ticket_code) {
        completedTicketLatchRef.current = {
          ticket: row.ticket_code,
          until: Date.now() + 120_000,
        };
      }
      uiRideRef.current = row;
      setRide(row);
      setTerminalBanner(row);
      pinTerminalRideId(row.id);
      clearPinnedTicket();
      activeTicketRef.current = null;
      stripRideIdFromBrowserUrl();
      rideIdRef.current = null;
      setDriverPublic(null);
      setSyncDebug(
        syncDebugForRow(
          row,
          source,
          note ??
            `${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`,
          dropReason,
        ),
      );
      return;
    }

    if (row && isBuyerActiveStatus(row.status)) {
      // If this ticket was recently completed, a stale active-status row from the
      // replica must not clear the terminal UI — bail out entirely.
      if (isTicketLatched(row.ticket_code, completedTicketLatchRef.current)) {
        setSyncDebug(syncDebugForRow(row, source, note ?? "stale-active:completed-latch", dropReason));
        return;
      }
      clearTerminalRideId();
      setTerminalBanner(null);
      setRide((prev) => {
        if (prev && isTerminalRideStatus(prev.status)) {
          const sameTicket =
            prev.ticket_code &&
            row.ticket_code &&
            normalizeTicketKey(prev.ticket_code) === normalizeTicketKey(row.ticket_code);
          if (sameTicket) return prev;
        }
        const next = mergeIncomingBuyerRide(prev, row);
        repinCanonicalRideId(next, rideIdRef, activeTicketRef);
        uiRideRef.current = next;
        return next;
      });
      setTerminalBanner(null);
      setSyncDebug(syncDebugForRow(row, source, note, dropReason));
      return;
    }

    if (readTerminalRideId() && Date.now() < requestLatchUntilRef.current) {
      setSyncDebug(syncDebugForRow(null, source, note ?? "terminal pinned", dropReason));
      return;
    }
    if (readTerminalRideId()) {
      clearTerminalRideId();
    }

    uiRideRef.current = null;
    setRide(null);
    setTerminalBanner(null);
    clearPinnedRideId();
    clearTerminalRideId();
    stripRideIdFromBrowserUrl();
    rideIdRef.current = null;
    setDriverPublic(null);
    setSyncDebug(syncDebugForRow(null, source, note, dropReason));
  },
  [mergeIncomingBuyerRide],
);

  const clearStaleRideUi = useCallback(() => {
    const ticketToDismiss =
      normalizeTicketKey(ride?.ticket_code) ||
      normalizeTicketKey(terminalBanner?.ticket_code) ||
      activeTicketRef.current ||
      urlTicketRef.current;
    if (ticketToDismiss) writeDismissedTicket(ticketToDismiss);
    clearPinnedRideId();
    clearTerminalRideId();
    stripRideIdFromBrowserUrl();
    rideIdRef.current = null;
    urlTicketRef.current = null;
    activeTicketRef.current = null;
    setRide(null);
    setTerminalBanner(null);
    setSyncDebug(syncDebugForRow(null, "clear"));
    // Block completed ride from resurfacing via poll for 10 minutes — persisted
    // to sessionStorage so a page refresh also respects the clear.
    userClearedUntilRef.current = Date.now() + 600_000;
    writeUserClearedUntil(userClearedUntilRef.current);
  }, [ride?.ticket_code, terminalBanner?.ticket_code]);

  /** Active trip: ride_events via /api/rides/buyer/status. Sync only to discover new rides. */
  const applyTruthRide = useCallback(
    (
      incoming: RideRow,
      driverPub: RideDriverPublic | null,
      source: string,
      note?: string,
    ): boolean => {
      if (!incoming?.id) return false;
      if (isTicketLatched(incoming.ticket_code, completedTicketLatchRef.current)) {
        return false;
      }
      clearDismissedTicket();
      userClearedUntilRef.current = 0;
      writeUserClearedUntil(0);
      repinCanonicalRideId(incoming, rideIdRef, activeTicketRef);
      if (driverPub) setDriverPublic(driverPub);
      clearTerminalRideId();
      setTerminalBanner(null);
      setRide((prev) => {
        if (prev && isTerminalRideStatus(prev.status)) {
          const sameTicket =
            prev.ticket_code &&
            incoming.ticket_code &&
            normalizeTicketKey(prev.ticket_code) === normalizeTicketKey(incoming.ticket_code);
          if (sameTicket) return prev;
        }
        const prevCode = prev?.status_code ?? rideStatusToCode(prev?.status);
        const incomingCode = incoming.status_code ?? rideStatusToCode(incoming.status);
        if (prev && incomingCode < prevCode) {
          return prev;
        }
        const next = prev ? { ...prev, ...incoming, status: incoming.status } : incoming;
        statusFloorByRideRef.current.set(next.id, rideStatusRank(next.status));
        uiRideRef.current = next;
        return next;
      });
      setSyncDebug(
        syncDebugForRow(
          incoming,
          source,
          note ??
            `${incoming.status}${incoming.status_code != null ? ` #${incoming.status_code}` : ""}${incoming.ticket_code ? ` · ${incoming.ticket_code}` : ""} · events`,
        ),
      );
      return true;
    },
    [],
  );

  const refreshActiveRide = useCallback(async (source = "poll") => {
    const seq = ++refreshSeqRef.current;
    const isStale = () => seq !== refreshSeqRef.current;

    const pinnedId = rideIdRef.current ?? readPinnedRideId();
    const ticketHint =
      urlTicketRef.current ||
      activeTicketRef.current ||
      readPinnedTicket() ||
      normalizeTicketKey(uiRideRef.current?.ticket_code) ||
      undefined;
    const rideRef = pinnedId ?? uiRideRef.current?.id ?? undefined;

    let truthApplied = false;
    if (ticketHint || rideRef) {
      let { ride: truthRow, driver_public: truthDriver, httpStatus } =
        await fetchBuyerRideTruth(ticketHint, rideRef);
      if (!truthRow?.id && rideRef) {
        const byId = await fetchBuyerRideTruth(undefined, rideRef);
        if (byId.ride?.id) {
          truthRow = byId.ride;
          truthDriver = byId.driver_public;
          httpStatus = byId.httpStatus;
        }
      }
      if (httpStatus === 401 && !isStale()) {
        setAuthError(t.loginRequired);
        return;
      }
      if (httpStatus === 404 && !isStale()) {
        setRequestError(t.ridesDisabled);
      }
      if (truthRow?.id && !isStale()) {
        truthApplied = applyTruthRide(truthRow, truthDriver, `${source}+events`);
        if (isTerminalRideStatus(truthRow.status)) return;
      }
    }

    if (truthApplied) {
      return;
    }

    // Ticket / ride pin from WhatsApp — never fall back to /sync (replica lag).
    if (ticketHint || rideRef) {
      return;
    }

    if (!SYNC_DISCOVERY_SOURCES.has(source)) {
      return;
    }

    const syncRideId = ticketHint ? undefined : pinnedId ?? undefined;
    const skipDismissed =
      hadUrlRideParamsRef.current &&
      (source === "mount" || source === "mount-retry");
    const dismissedForSync = skipDismissed ? undefined : readDismissedTicket() || undefined;
    const syncResult = await fetchRideSync(
      syncRideId,
      ticketHint || undefined,
      dismissedForSync,
    );

    if (!syncResult.ok) {
      if (!isStale()) {
        setSyncDebug(syncDebugForRow(uiRideRef.current, source, `sync error ${syncResult.status}`));
      }
      return;
    }

    const sync = syncResult.payload;
    const row = sync.ride as RideRow | null;
    if (row?.id && !isStale()) {
      const { ride: resolved, driver_public: resolvedDriver } = await fetchBuyerRideTruth(
        row.ticket_code ?? ticketHint,
        row.id,
      );
      const finalRow = resolved?.id ? resolved : row;
      applyTruthRide(
        finalRow,
        resolvedDriver ?? sync.driver_public ?? null,
        `${source}+discover`,
      );
    } else if (!uiRideRef.current && sync.driver_public) {
      setDriverPublic(sync.driver_public);
    }
  }, [applyTruthRide, t.loginRequired, t.ridesDisabled]);

  const recoverActiveTrip = useCallback(async () => {
    setRecoverBusy(true);
    clearDismissedTicket();
    userClearedUntilRef.current = 0;
    writeUserClearedUntil(0);
    completedTicketLatchRef.current = null;

    const ticket = normalizeTicketKey(
      recoverTicketInput ||
        urlTicketRef.current ||
        activeTicketRef.current ||
        readPinnedTicket() ||
        ride?.ticket_code ||
        "",
    );
    if (ticket) {
      urlTicketRef.current = ticket;
      activeTicketRef.current = ticket;
      pinActiveTicket(ticket);
      const { ride: fastRow, driver_public: fastDriver } = await fetchBuyerRideTruth(
        ticket,
        ride?.id,
      );
      if (fastRow?.id) {
        applyTruthRide(fastRow, fastDriver, "recover");
        setRecoverBusy(false);
        return;
      }
    }

    if (ride?.id) {
      const { ride: byId, driver_public: byIdDriver } = await fetchBuyerRideTruth(null, ride.id);
      if (byId?.id) {
        applyTruthRide(byId, byIdDriver, "recover-id");
        setRecoverBusy(false);
        return;
      }
    }

    await refreshActiveRide("manual");
    setRecoverBusy(false);
  }, [applyTruthRide, recoverTicketInput, refreshActiveRide, ride?.id, ride?.ticket_code]);

  // Keep SSE through in_trip so we receive the completed event.
  const liveRideId =
    ride?.id && (isBuyerActiveStatus(ride.status) || ride.status === "in_trip")
      ? ride.id
      : readPinnedRideId();

  const liveStreamEnabled = !authError && Boolean(liveRideId);

  useRideLiveStream({
    streamUrl: liveRideId ? `/api/rides/${liveRideId}/stream` : null,
    enabled: liveStreamEnabled,
    onEvent: (payload) => {
      const seqAtEvent = refreshSeqRef.current;
      void (async () => {
        const body = payload as {
          lifecycle?: { to_status?: string; event_type?: string };
          ride?: RideRow;
        };
        const lifecycleStatus = body.lifecycle?.to_status?.trim();
        if (lifecycleStatus && uiRideRef.current?.id) {
          const current = uiRideRef.current;
          if (rideStatusRank(lifecycleStatus) > rideStatusRank(current.status)) {
            applyTruthRide(
              { ...current, status: lifecycleStatus },
              null,
              "SSE-lifecycle",
              body.lifecycle?.event_type,
            );
          }
        }

        let row = body.ride;
        if (!row?.id) return;
        const { ride: truth, driver_public: truthDriver } = await fetchBuyerRideTruth(
          row.ticket_code,
          row.id,
        );
        if (seqAtEvent !== refreshSeqRef.current) return;
        if (truth?.id) {
          applyTruthRide(truth, truthDriver, "SSE");
        } else {
          row = await resolveRowByTicketCanonical(row);
          applyTruthRide(row, null, "SSE+canonical");
        }
      })();
    },
    fallbackPollMs: liveRideId ? 2_000 : 8_000,
    onFallbackPoll: () => void refreshActiveRide("poll-backup"),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const rideParam = url.searchParams.get("ride")?.trim();
    const ticketParam = url.searchParams.get("ticket")?.trim();
    if (ticketParam) {
      const ticket = normalizeTicketKey(ticketParam);
      urlTicketRef.current = ticket;
      activeTicketRef.current = ticket;
      pinActiveTicket(ticket);
      setRecoverTicketInput(ticket);
    }
    if (rideParam || ticketParam) {
      clearTerminalRideId();
      clearDismissedTicket();
      userClearedUntilRef.current = 0;
      writeUserClearedUntil(0);
      completedTicketLatchRef.current = null;
      // WhatsApp links open in a fresh context — replica lag can make the first
      // sync return a stale status. Schedule a re-sync to catch up.
      hadUrlRideParamsRef.current = true;
    }
    if (rideParam) {
      pinRideId(rideParam);
      rideIdRef.current = rideParam;
    }
    const storedTicket = readPinnedTicket();
    const storedRideId = readPinnedRideId();
    if (!ticketParam && storedTicket) {
      urlTicketRef.current = storedTicket;
      activeTicketRef.current = storedTicket;
    }
    if (!rideParam && storedRideId) {
      rideIdRef.current = storedRideId;
    }
    stripRideIdFromBrowserUrl();
  }, []);

  useEffect(() => {
    const sessionTicket = readPinnedTicket();
    if (sessionTicket && !recoverTicketInput) {
      setRecoverTicketInput(sessionTicket);
    }
  }, [recoverTicketInput]);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.user?.id) setAuthError(t.loginRequired);
        else {
          setSessionPhone(String(d.user.phone ?? "").trim() || null);
          void refreshActiveRide("mount");
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 400);
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 1200);
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 3000);
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 6000);
        }
      })
      .catch(() => setAuthError(t.sessionError));
  }, [refreshActiveRide, t.loginRequired, t.sessionError]);

  useEffect(() => {
    if (authError) return;
    const terminal = ride?.status === "completed" || ride?.status === "cancelled";
    const activeTrip =
      ride?.status &&
      (isBuyerActiveStatus(ride.status) || ride.status === "in_trip");
    const ms = terminal
      ? 8_000
      : ride?.status === "arrived"
        ? 400
        : activeTrip
          ? 700
          : ride
            ? 2_000
            : 5_000;
    const timer = setInterval(() => void refreshActiveRide("poll"), ms);
    return () => clearInterval(timer);
  }, [authError, ride?.status, refreshActiveRide]);

  useEffect(() => {
    const onFocus = () => void refreshActiveRide("focus");
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshActiveRide]);

  useEffect(() => {
    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) void refreshActiveRide("pageshow");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refreshActiveRide]);

  // visibilitychange fires reliably on mobile (WhatsApp in-app browser, iOS Safari)
  // when the user switches back to this tab after checking WhatsApp messages.
  // The polling timers are throttled/paused in background — burst re-sync on return.
  useEffect(() => {
    const burst = () => {
      void refreshActiveRide("visibility");
      window.setTimeout(() => void refreshActiveRide("visibility"), 600);
      window.setTimeout(() => void refreshActiveRide("visibility"), 1800);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") burst();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshActiveRide]);

  const rideSectionTitle =
    ride?.status === "cancelled"
      ? t.rideCancelled
      : ride?.status === "completed"
        ? t.rideCompleted
      : ride?.status === "in_trip"
        ? t.rideInProgress
        : ride?.status === "arrived"
          ? t.rideAtPickup
          : ride?.status === "accepted"
            ? t.rideDriverEnRoute
            : ride?.driver_id || ride?.status === "matched"
              ? t.rideMatched
              : ride?.status === "requested"
                ? t.rideActive
                : t.rideCreated;

  /** Only in-progress trips block a new request — completed/cancelled may stay visible above the form. */
  const hasBlockingActiveTrip = Boolean(
    ride && isBuyerActiveStatus(ride.status),
  );

  const canSubmit = useMemo(
    () => pickupColonia !== dropoffColonia && !authError && !hasBlockingActiveTrip,
    [pickupColonia, dropoffColonia, authError, hasBlockingActiveTrip],
  );

  const runEstimate = useCallback(async () => {
    if (pickupColonia === dropoffColonia) {
      setEstimateError(t.pickDifferentColonias);
      return;
    }
    setEstimating(true);
    setEstimateError(null);
    try {
      const r = await fetch("/api/rides/pricing/estimate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_colonia: pickupColonia,
          dropoff_colonia: dropoffColonia,
          pickup_address: pickupAddress.trim() || coloniaLabel(pickupColonia),
          dropoff_address: dropoffAddress.trim() || coloniaLabel(dropoffColonia),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEstimate(null);
        setEstimateError(data?.error ?? t.estimateFailed);
        return;
      }
      setEstimate(data.estimate ?? null);
    } finally {
      setEstimating(false);
    }
  }, [pickupColonia, dropoffColonia, pickupAddress, dropoffAddress, t.pickDifferentColonias, t.estimateFailed]);

  const requestRide = async () => {
    if (!canSubmit) return;
    setRequesting(true);
    setRequestError(null);
    clearTerminalRideId();
    completedTicketLatchRef.current = null;
    urlTicketRef.current = null;
    activeTicketRef.current = null;
    clearPinnedTicket();
    setTerminalBanner(null);
    setRide(null);
    try {
      const r = await fetch("/api/rides/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup_colonia: pickupColonia,
          dropoff_colonia: dropoffColonia,
          pickup_address: pickupAddress.trim() || undefined,
          dropoff_address: dropoffAddress.trim() || undefined,
          passengers,
          auto_match: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data?.code === "insufficient_balance") {
          setRequestError((data?.error ?? t.insufficientBalance) + t.topUpHint);
        } else if (data?.code === "no_drivers") {
          const hints =
            data?.dispatch_debug?.checks?.length > 0
              ? `\n\n${(data.dispatch_debug.checks as string[]).join("\n")}`
              : "";
          setRequestError((data?.error ?? t.noDriversAvailable) + hints);
        } else if (data?.code === "active_ride_exists") {
          setRequestError(data?.error ?? t.requestFailed);
          void refreshActiveRide("active-ride-block");
        } else {
          setRequestError(data?.error ?? t.requestFailed);
        }
        setRide(null);
        return;
      }
      const rideRow = data.ride ?? null;
      if (rideRow?.status === "cancelled") {
        setRequestError(t.noDriversAvailable);
        setRide(null);
        return;
      }
      clearPinnedRideId();
      if (rideRow?.id) {
        userClearedUntilRef.current = 0;
        writeUserClearedUntil(0);
        clearDismissedTicket();
        requestLatchUntilRef.current = Date.now() + 120_000;
        refreshSeqRef.current += 1;
        statusFloorByRideRef.current.set(rideRow.id, rideStatusRank(rideRow.status));
        repinCanonicalRideId(rideRow, rideIdRef, activeTicketRef);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("ride", rideRow.id);
          window.history.replaceState(null, "", url.toString());
        }
      }
      applyServerRide(rideRow, "request");
      if (rideRow?.id) {
        const { ride: truth, driver_public: truthDriver } = await fetchBuyerRideTruth(
          rideRow.ticket_code,
          rideRow.id,
        );
        if (truth?.id) {
          applyTruthRide(truth, truthDriver, "request-truth");
        } else {
          const fresh = await fetchRideRowById<RideRow>(rideRow.id);
          if (fresh) applyServerRide(fresh, "request-verify");
        }
      }
      window.setTimeout(() => void refreshActiveRide("post-request"), 500);
      if (data.estimate) setEstimate(data.estimate);
    } finally {
      setRequesting(false);
    }
  };

  const cancelRide = async () => {
    if (!ride) return;
    setActionBusy(true);
    setRequestError(null);
    try {
      const r = await fetch(`/api/rides/${ride.id}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "buyer_cancel" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRequestError(data?.error ?? t.cancelFailed);
        return;
      }
      const cancelled = data.ride as RideRow | undefined;
      applyServerRide(cancelled ?? null, "cancel");
      if (ride?.id) {
        const fresh = await fetchRideRowById<RideRow>(ride.id);
        if (fresh) applyServerRide(fresh, "cancel-verify");
      }
    } finally {
      setActionBusy(false);
    }
  };

  const addTip = async () => {
    if (!ride) return;
    setActionBusy(true);
    setRequestError(null);
    try {
      const r = await fetch(`/api/rides/${ride.id}/tip`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tip_mxn: tipMxn }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRequestError(data?.error ?? t.tipFailed);
        return;
      }
      applyServerRide(data.ride ?? null, "tip");
    } finally {
      setActionBusy(false);
    }
  };

  const durationMin = estimate ? Math.round(estimate.duration_s / 60) : null;
  const distanceKm = estimate ? (estimate.distance_m / 1000).toFixed(1) : null;

  const sessionTail = sessionPhone && sessionPhone.length >= 4 ? sessionPhone.slice(-4) : "";
  const loggedInAsDriver =
    Boolean(sessionPhone) &&
    (sessionPhone!.endsWith("6902") || sessionPhone!.includes("4151816902"));

  return (
    <main className="min-h-screen bg-[#F8F4ED] text-[#1B4332]">
      <div className="mx-auto max-w-lg px-4 py-8">
        <RidesStagingBanner />
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="mt-1 text-sm text-[#1B4332]/70">{t.subtitle}</p>
          </div>
          <Link href={withLang("/saldo", lang)} className="text-sm font-medium underline">
            {t.balance}
          </Link>
        </div>

        {authError && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            {authError}{" "}
            <Link href={withLang("/auth/login", lang)} className="font-medium underline">
              {t.login}
            </Link>
          </div>
        )}

        {sessionTail && !authError && (
          <p className="mb-3 text-xs text-[#1B4332]/60">
            {lang === "es" ? "Sesión" : "Session"}: …{sessionTail}
          </p>
        )}

        {loggedInAsDriver && !authError && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {lang === "es"
              ? "Estás con la cuenta del conductor (415…6902). Cierra sesión en /unete e inicia con el WhatsApp del pasajero (Kay · …8527)."
              : "You are logged in as the driver (415…6902). Log out at /unete and sign in with the rider WhatsApp (Kay · …8527)."}
            {" "}
            <Link href={withLang("/unete", lang)} className="font-medium underline">
              /unete
            </Link>
          </div>
        )}

        {!authError && !loggedInAsDriver && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2">
            <p className="font-medium">
              {lang === "es"
                ? ride
                  ? "¿El estado no se actualiza?"
                  : "¿Tienes un viaje activo?"
                : ride
                  ? "Status not updating?"
                  : "Have an active trip?"}
            </p>
            <p className="text-xs opacity-90">
              {lang === "es"
                ? "Pega tu ticket NG-… y pulsa buscar — no pidas otro viaje todavía."
                : "Paste your NG-… ticket and tap find — do not request another ride yet."}
            </p>
            <input
              className="w-full rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-mono bg-white"
              placeholder="NG-30964A96"
              value={recoverTicketInput}
              onChange={(e) => setRecoverTicketInput(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              disabled={recoverBusy}
              className="rounded-full bg-[#1B4332] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void recoverActiveTrip()}
            >
              {recoverBusy
                ? lang === "es"
                  ? "Cargando…"
                  : "Loading…"
                : lang === "es"
                  ? "Buscar mi viaje activo"
                  : "Find my active trip"}
            </button>
          </div>
        )}

        {syncDebug?.dropReason?.startsWith("verify:completed") && !ride && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            {lang === "en"
              ? "Your last trip is already completed. Request a new ride below."
              : "Tu último viaje ya terminó. Pide un viaje nuevo abajo."}
          </div>
        )}

        {syncDebug && (
          <p
            className={`mb-4 rounded-lg border px-3 py-2 text-xs font-mono leading-relaxed ${
              syncDebug.mismatch
                ? "border-red-300 bg-red-50 text-red-900"
                : "border-[#1B4332]/15 bg-white/90 text-[#1B4332]/70"
            }`}
          >
            {formatRiderSyncDebug(syncDebug)}
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() => void refreshActiveRide("manual")}
            >
              refresh
            </button>
          </p>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t.pickupColonia}</label>
            <select
              className="w-full rounded-lg border border-[#1B4332]/20 px-3 py-2"
              value={pickupColonia}
              onChange={(e) => setPickupColonia(e.target.value)}
            >
              {COLONIAS_LIST.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="mt-2 w-full rounded-lg border border-[#1B4332]/20 px-3 py-2 text-sm"
              placeholder={t.pickupDetail}
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.dropoffColonia}</label>
            <select
              className="w-full rounded-lg border border-[#1B4332]/20 px-3 py-2"
              value={dropoffColonia}
              onChange={(e) => setDropoffColonia(e.target.value)}
            >
              {COLONIAS_LIST.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="mt-2 w-full rounded-lg border border-[#1B4332]/20 px-3 py-2 text-sm"
              placeholder={t.dropoffDetail}
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.passengers}</label>
            <input
              type="number"
              min={1}
              max={8}
              className="w-24 rounded-lg border border-[#1B4332]/20 px-3 py-2"
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={runEstimate}
              disabled={estimating || pickupColonia === dropoffColonia}
              className="rounded-full border border-[#1B4332] px-5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {estimating ? t.estimating : t.seeFare}
            </button>
            <button
              type="button"
              onClick={requestRide}
              disabled={requesting || !canSubmit}
              className="rounded-full bg-[#1B4332] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {requesting ? t.requesting : t.requestTaxi}
            </button>
          </div>

          {!canSubmit && hasBlockingActiveTrip && !authError && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t.activeTripBlocksRequest}
            </p>
          )}

          {estimateError && <p className="text-sm text-red-700">{estimateError}</p>}
          {requestError && <p className="text-sm text-red-700">{requestError}</p>}

          {estimate && (
            <div className="rounded-lg bg-[#F8F4ED] px-4 py-3 text-sm">
              <p>
                {t.estimatedFare}{" "}
                <strong>{formatCurrencyMXN(estimate.estimated_total_mxn_cents, lang)}</strong>
              </p>
              <p className="text-[#1B4332]/70">
                {t.balanceHold} {formatCurrencyMXN(estimate.hold_amount_mxn_cents, lang)} · ~
                {distanceKm} {t.km} · ~{durationMin} {t.min}
                {estimate.surge_multiplier > 1 ? ` · ${t.surge} ×${estimate.surge_multiplier}` : ""}
              </p>
            </div>
          )}
        </section>

        {ride && (isBuyerActiveStatus(ride.status) || isTerminalRideStatus(ride.status)) && (
          <section
            className={`mt-6 rounded-2xl border-2 bg-white p-5 shadow-sm ${
              ride.status === "cancelled"
                ? "border-red-300 bg-red-50/30"
                : ride.status === "completed"
                  ? "border-emerald-300"
                  : "border-[#1B4332]/20"
            }`}
          >
            <h2 className="font-semibold text-lg">{rideSectionTitle}</h2>
            <p className="mt-2 text-sm">
              {t.status} <strong>{rideStatusLabel(ride.status, lang)}</strong>
            </p>
            {ride.status === "cancelled" && (
              <p className="mt-2 text-sm text-red-800">
                {t.rideCancelledHint} {t.rideCancelledStaleMatched}
              </p>
            )}
            <p className="text-sm text-[#1B4332]/80">
              {ride.pickup_address} → {ride.dropoff_address}
            </p>
            {(ride.created_at || (ride.passengers != null && ride.passengers > 0)) && (
              <p className="mt-1 text-xs text-[#1B4332]/65">
                {ride.created_at ? (
                  <>
                    {t.requestedAt}{" "}
                    {new Date(ride.created_at).toLocaleString(lang === "en" ? "en-MX" : "es-MX", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </>
                ) : null}
                {ride.created_at && ride.passengers != null && ride.passengers > 0 ? " · " : null}
                {ride.passengers != null && ride.passengers > 0 ? (
                  <>
                    {t.ridePassengers} {ride.passengers}
                  </>
                ) : null}
              </p>
            )}
            {ride.ticket_code && (
              <p className="mt-3 text-lg font-mono font-bold">
                {t.ticket} {ride.ticket_code}
              </p>
            )}
            {driverPublic && ride.driver_id && ride.status !== "requested" && (
              <div className="mt-4 rounded-xl border border-[#1B4332]/15 bg-[#F8F4ED] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1B4332]/60">
                  {lang === "es" ? "Tu conductor" : "Your driver"}
                </p>
                <p className="mt-1 text-base font-semibold">
                  {driverPublic.display_name ?? (lang === "es" ? "Conductor" : "Driver")}
                </p>
                {(driverPublic.vehicle_color ||
                  driverPublic.vehicle_make ||
                  driverPublic.vehicle_plates) && (
                  <p className="mt-1 text-sm text-[#1B4332]/80">
                    {[
                      driverPublic.vehicle_color,
                      [driverPublic.vehicle_make, driverPublic.vehicle_model]
                        .filter(Boolean)
                        .join(" "),
                      driverPublic.vehicle_plates
                        ? `${lang === "es" ? "Placas" : "Plates"} ${driverPublic.vehicle_plates}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
            {!ride.driver_id && ride.status === "requested" && (
              <p className="mt-2 text-sm text-amber-800">{t.findingDriver}</p>
            )}
            {ride.status === "matched" && ride.driver_id && (
              <p className="mt-2 text-sm text-amber-800">{t.driverMatchedHint}</p>
            )}
            {ride.status === "accepted" && (
              <p className="mt-2 text-sm text-emerald-800">{t.driverAcceptedHint}</p>
            )}
            {ride.status === "arrived" && (
              <p className="mt-2 text-sm text-emerald-800">{t.driverArrivedHint}</p>
            )}
            {ride.status === "in_trip" && (
              <p className="mt-2 text-sm text-emerald-800">{t.driverInTripHint}</p>
            )}
            {ride.status === "completed" && (
              <p className="mt-2 text-sm text-emerald-800">
                {t.rideCompletedHint}
                {(ride.final_total_mxn_cents ?? ride.estimated_total_mxn_cents) > 0 && (
                  <>
                    {" "}
                    {t.chargedFare}{" "}
                    <strong>
                      {formatCurrencyMXN(
                        ride.final_total_mxn_cents ?? ride.estimated_total_mxn_cents,
                        lang,
                      )}
                    </strong>
                  </>
                )}
              </p>
            )}
            <p className="mt-2 text-xs text-[#1B4332]/50">
              {["requested", "matched", "accepted", "arrived", "in_trip"].includes(ride.status)
                ? t.rideSyncHint
                : null}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void refreshActiveRide("manual")}
              >
                {t.refreshStatusNow}
              </button>
              {" · "}
              <button
                type="button"
                className="underline font-semibold"
                onClick={clearStaleRideUi}
              >
                {isBuyerActiveStatus(ride.status) ? t.requestAnotherRide : t.clearRideScreen}
              </button>
            </p>
            {isBuyerActiveStatus(ride.status) && (
              <button
                type="button"
                onClick={clearStaleRideUi}
                className="mt-3 rounded-full border border-[#1B4332] px-4 py-2 text-sm font-medium text-[#1B4332] hover:bg-[#ECFDF5]"
              >
                {t.requestAnotherRide}
              </button>
            )}
            {["requested", "matched", "accepted", "arrived"].includes(ride.status) && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={cancelRide}
                className="mt-3 rounded-full border border-red-700 px-4 py-2 text-sm text-red-800 disabled:opacity-50"
              >
                {t.cancelRide}
              </button>
            )}
            {isTerminalRideStatus(ride.status) && (
              <button
                type="button"
                onClick={clearStaleRideUi}
                className="mt-4 rounded-full bg-[#1B4332] px-5 py-2 text-sm font-medium text-white"
              >
                {t.requestAnotherRide}
              </button>
            )}
            {ride.status === "completed" && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  {t.tipMxn}
                  <input
                    type="number"
                    min={1}
                    className="ml-2 w-20 rounded border px-2 py-1"
                    value={tipMxn}
                    onChange={(e) => setTipMxn(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={addTip}
                  className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {t.sendTip}
                </button>
              </div>
            )}
            <p className="mt-3 text-xs text-[#1B4332]/60">ID: {ride.id}</p>
          </section>
        )}

        {terminalBanner && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
            <p className="font-medium">{t.rideCompleted}</p>
            <p className="mt-1 text-[#1B4332]/80">
              {terminalBanner.ticket_code && (
                <span className="font-mono font-bold">{terminalBanner.ticket_code}</span>
              )}{" "}
              {terminalBanner.pickup_address} → {terminalBanner.dropoff_address}
            </p>
            <button
              type="button"
              className="mt-3 rounded-full bg-[#1B4332] px-5 py-2 text-sm font-medium text-white"
              onClick={clearStaleRideUi}
            >
              {t.requestAnotherRide}
            </button>
          </section>
        )}

        <p className="mt-8 text-xs text-[#1B4332]/60 leading-relaxed">
          {t.whatsappHelp} <code>/api/rides/whatsapp/inbound</code>. {t.whatsappRequires}{" "}
          <Link href={withLang("/saldo", lang)} className="underline">
            /saldo
          </Link>
        </p>
      </div>
    </main>
  );
}
