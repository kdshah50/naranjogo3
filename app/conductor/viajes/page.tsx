"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
import { useDriverGpsPing } from "@/hooks/use-driver-gps-ping";
import {
  fetchActiveDriverTrips,
  fetchDriverPanel,
  fetchDriverRecoverByTicket,
  fetchRideRowById,
} from "@/lib/rides/client-ride-sync";
import { fetchRidesEnabledOnServer } from "@/lib/rides/client-rides-enabled";
import { mergeRideStatusRow, rideStatusRank } from "@/lib/rides/ride-status-merge";
import {
  driverFlowStepIndex,
  driverFlowSteps,
  driverTripActionHint,
  driverTripsCopy,
  rideStatusLabel,
} from "@/lib/rides/ui-copy";
import { rideRouteSummaryFromRow } from "@/lib/rides/ride-route-summary";

const DRIVER_ACTIVE_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);
const CONDUCTOR_TERMINAL_RIDE_KEY = "ng_conductor_terminal_ride_id";
const CONDUCTOR_ACTIVE_RIDE_KEY = "ng_conductor_active_ride_id";
const CONDUCTOR_ACTIVE_TICKET_KEY = "ng_conductor_active_ticket";
const CONDUCTOR_COMPLETED_TICKET_KEY = "ng_conductor_completed_ticket";

function readDriverActiveRideId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(CONDUCTOR_ACTIVE_RIDE_KEY)?.trim();
  return id || null;
}

function rememberDriverActiveRideId(rideId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CONDUCTOR_ACTIVE_RIDE_KEY, rideId);
  sessionStorage.removeItem(CONDUCTOR_TERMINAL_RIDE_KEY);
  clearDriverCompletedTicketLatch();
}

function clearDriverActiveRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CONDUCTOR_ACTIVE_RIDE_KEY);
  clearDriverActiveTicket();
}

function readDriverActiveTicket(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const ticket = sessionStorage.getItem(CONDUCTOR_ACTIVE_TICKET_KEY)?.trim();
  return ticket ? normalizeTicketKey(ticket) : null;
}

function rememberDriverActiveTicket(ticketCode: string | null | undefined) {
  if (typeof sessionStorage === "undefined") return;
  const ticket = normalizeTicketKey(ticketCode);
  if (ticket) sessionStorage.setItem(CONDUCTOR_ACTIVE_TICKET_KEY, ticket);
}

function clearDriverActiveTicket() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CONDUCTOR_ACTIVE_TICKET_KEY);
}

function readDriverTerminalRideId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(CONDUCTOR_TERMINAL_RIDE_KEY)?.trim();
  return id || null;
}

function rememberDriverTerminalRideId(rideId: string, ticketCode?: string | null) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CONDUCTOR_TERMINAL_RIDE_KEY, rideId);
  const ticket = normalizeTicketKey(ticketCode);
  if (ticket) sessionStorage.setItem(CONDUCTOR_COMPLETED_TICKET_KEY, ticket);
}

function readDriverCompletedTicketLatch(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const ticket = sessionStorage.getItem(CONDUCTOR_COMPLETED_TICKET_KEY)?.trim();
  return ticket ? normalizeTicketKey(ticket) : null;
}

function clearDriverCompletedTicketLatch() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CONDUCTOR_COMPLETED_TICKET_KEY);
}

function clearDriverTerminalRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CONDUCTOR_TERMINAL_RIDE_KEY);
  clearDriverCompletedTicketLatch();
}

function normalizeTicketKey(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

function filterDriverPanelTrips(
  trips: RideRow[],
  hideTickets: string[],
  completedLatch: { ticket: string; until: number } | null,
): RideRow[] {
  const hidden = new Set(hideTickets.map(normalizeTicketKey).filter(Boolean));
  const latchedTicket =
    completedLatch && Date.now() < completedLatch.until
      ? normalizeTicketKey(completedLatch.ticket)
      : "";
  return trips.filter((row) => {
    const ticket = normalizeTicketKey(row.ticket_code);
    if (ticket && hidden.has(ticket)) return false;
    if (latchedTicket && ticket === latchedTicket) return false;
    return true;
  });
}

function isDriverActiveTrip(row: RideRow): boolean {
  return DRIVER_ACTIVE_STATUSES.has(row.status);
}

function sortDriverTrips(rows: RideRow[]): RideRow[] {
  return [...rows].sort((a, b) => {
    const rDiff = rideStatusRank(b.status) - rideStatusRank(a.status);
    if (rDiff !== 0) return rDiff;
    const tA = a.updated_at ?? a.created_at ?? "";
    const tB = b.updated_at ?? b.created_at ?? "";
    return tB.localeCompare(tA);
  });
}

function activeTripsFromPanel(raw: RideRow[]): RideRow[] {
  return sortDriverTrips(raw.filter((row) => row?.id && isDriverActiveTrip(row)));
}

/** One ticket → one row (newest / highest lifecycle wins). */
function dedupeDriverTrips(rows: RideRow[]): RideRow[] {
  const byKey = new Map<string, RideRow>();
  for (const row of sortDriverTrips(rows)) {
    const key = (row.ticket_code ?? "").trim().toUpperCase() || row.id;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, row);
      continue;
    }
    const rankDiff = rideStatusRank(row.status) - rideStatusRank(cur.status);
    if (rankDiff > 0) {
      byKey.set(key, row);
      continue;
    }
    if (rankDiff === 0 && (row.updated_at ?? "") >= (cur.updated_at ?? "")) {
      byKey.set(key, row);
    }
  }
  return sortDriverTrips([...byKey.values()]);
}

type RideRow = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_colonia?: string | null;
  dropoff_colonia?: string | null;
  ticket_code: string | null;
  estimated_total_mxn_cents: number;
  created_at?: string;
  updated_at?: string;
};

type DriverOnline = {
  user_id?: string;
  is_online: boolean;
  is_active_driver?: boolean;
};

type SyncDebug = {
  source: string;
  at: string;
  apiCount: number;
  apiSummary: string;
  uiCount: number;
  mismatch: boolean;
};

function formatSyncDebug(d: SyncDebug): string {
  const flag = d.mismatch ? " · UI MISMATCH" : "";
  return `Panel API: ${d.apiSummary} · UI: ${d.uiCount} trip(s)${flag} · ${d.source} ${d.at}`;
}

function stripRideFromBrowserUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hadRide = url.searchParams.has("ride");
  const hadTicket = url.searchParams.has("ticket");
  if (!hadRide && !hadTicket) return;
  if (hadRide) url.searchParams.delete("ride");
  if (hadTicket) url.searchParams.delete("ticket");
  window.history.replaceState(null, "", url.toString());
}

function isTerminalDriverTrip(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export default function ConductorViajesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8F4ED] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
        </main>
      }
    >
      <ConductorViajesInner />
    </Suspense>
  );
}

const PANEL_DISCOVERY_SOURCES = new Set([
  "mount",
  "mount-retry",
  "manual",
  "recover",
  "url-pin",
]);

function ConductorViajesInner() {
  const lang = useAppLang();
  const t = driverTripsCopy(lang);
  const searchParams = useSearchParams();
  const pinnedRideIdRef = useRef<string | null>(
    String(searchParams.get("ride") ?? "").trim() || null,
  );
  const urlTicketRef = useRef<string | null>(
    normalizeTicketKey(String(searchParams.get("ticket") ?? "").trim()) || null,
  );
  /** After accept/arrive/start, ignore stale panel polls briefly. */
  const actionLatchUntilRef = useRef(0);

  const [online, setOnline] = useState<DriverOnline | null>(null);
  const [trips, setTrips] = useState<RideRow[]>([]);
  const [completedNotice, setCompletedNotice] = useState<RideRow | null>(null);
  const [syncDebug, setSyncDebug] = useState<SyncDebug | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ticketByRide, setTicketByRide] = useState<Record<string, string>>({});
  const [canonicalUserId, setCanonicalUserId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [sessionPhone, setSessionPhone] = useState<string | null>(null);
  const [driverApproved, setDriverApproved] = useState(false);
  const [ridesDisabledOnServer, setRidesDisabledOnServer] = useState(false);
  const [debugChecks, setDebugChecks] = useState<string[] | null>(null);
  const [debugBusy, setDebugBusy] = useState(false);
  const [recoverTicketInput, setRecoverTicketInput] = useState(() =>
    normalizeTicketKey(String(searchParams.get("ticket") ?? "").trim()),
  );

  /** After Conectar succeeds, ignore stale panel polls that still say offline. */
  const onlineLatchUntilRef = useRef(0);
  /** Last panel/online response with is_active_driver — survives online latch merges. */
  const lastApprovedDriverRef = useRef<DriverOnline | null>(null);
  const driverApprovedRef = useRef(false);
  /** Ignore out-of-order load() results when a newer load started. */
  const syncGenRef = useRef(0);
  /** After POST accept/arrive/start, polls must not downgrade this ride's status. */
  const statusFloorByRideRef = useRef<Map<string, number>>(new Map());
  /** After complete, ignore ghost duplicate rows for this ticket briefly. */
  const completedTicketLatchRef = useRef<{ ticket: string; until: number } | null>(null);
  /** Keep trips visible when a later slow/timed-out panel poll fails. */
  const tripsRef = useRef<RideRow[]>([]);
  /** After recover/URL ticket load, ignore empty verify wipes briefly. */
  const recoverLatchUntilRef = useRef(0);

  /** Never downgrade lifecycle after POST accept/arrive/start (GET/panel can lag). */
  const mergeIncomingDriverTrip = useCallback((prev: RideRow[], incoming: RideRow): RideRow[] => {
    const ex = prev.find((t) => t.id === incoming.id);
    let merged = ex ? mergeRideStatusRow(ex, incoming) : incoming;
    const floor = statusFloorByRideRef.current.get(incoming.id);
    if (floor !== undefined && rideStatusRank(merged.status) < floor) {
      merged = ex ?? merged;
    }
    const rest = prev.filter((t) => t.id !== incoming.id);
    return dedupeDriverTrips([...rest, merged]);
  }, []);

  /** Apply trip row from POST /accept|arrive|start|complete — panel poll can lag behind DB. */
  const upsertTripFromAction = useCallback(
    (incoming: RideRow) => {
      if (!incoming?.id) return;
      if (!isDriverActiveTrip(incoming)) {
        setTrips((prev) => prev.filter((t) => t.id !== incoming.id));
        return;
      }
      setTrips((prev) => mergeIncomingDriverTrip(prev, incoming));
    },
    [mergeIncomingDriverTrip],
  );

  /** Authoritative row by id — event-truth first, GET by id can lag. */
  const refreshTripById = useCallback(
    async (rideId: string) => {
      const ticket = readDriverActiveTicket() || undefined;
      const fast = await fetchDriverRecoverByTicket(ticket ?? "", rideId);
      if (fast.ok && fast.trips.length > 0) {
        const row = fast.trips[0] as RideRow;
        if (isDriverActiveTrip(row)) {
          setTrips((prev) => mergeIncomingDriverTrip(prev, row));
        } else {
          setTrips((prev) => prev.filter((t) => t.id !== rideId));
        }
        return;
      }
      const row = await fetchRideRowById<RideRow>(rideId);
      if (!row) return;
      if (isDriverActiveTrip(row)) {
        setTrips((prev) => mergeIncomingDriverTrip(prev, row));
      } else {
        setTrips((prev) => prev.filter((t) => t.id !== rideId));
      }
    },
    [mergeIncomingDriverTrip],
  );

  const applyServerTrips = useCallback((raw: RideRow[], source: string, replaceWhenEmpty = false) => {
    const incoming = dedupeDriverTrips(activeTripsFromPanel(raw));
    setTrips((prev) => {
      if (replaceWhenEmpty && incoming.length === 0) return [];
      const floors = statusFloorByRideRef.current;
      const merged: RideRow[] = [];
      for (const row of incoming) {
        const floor = floors.get(row.id);
        const ex = prev.find((p) => p.id === row.id);
        let nextRow = ex ? mergeRideStatusRow(ex, row) : row;
        if (floor !== undefined && rideStatusRank(nextRow.status) < floor) {
          nextRow = ex ?? nextRow;
        }
        merged.push(nextRow);
      }
      if (!replaceWhenEmpty) {
        for (const ex of prev) {
          if (!merged.some((m) => m.id === ex.id) && isDriverActiveTrip(ex)) {
            const floor = floors.get(ex.id);
            if (floor === undefined || rideStatusRank(ex.status) >= floor) {
              merged.push(ex);
            }
          }
        }
      }
      const next = dedupeDriverTrips(merged);
      tripsRef.current = next;
      return next;
    });
    const apiSummary =
      incoming.length === 0
        ? "0 trips"
        : `${incoming.length} trip · ${incoming[0].status}${incoming[0].ticket_code ? ` · ${incoming[0].ticket_code}` : ""}`;
    setSyncDebug({
      source,
      at: new Date().toLocaleTimeString(),
      apiCount: incoming.length,
      apiSummary,
      uiCount: incoming.length,
      mismatch: false,
    });
  }, []);

  /** Re-fetch each row by id — list/SSE payloads can lag behind DB (e.g. completed still shown as accepted). */
  const verifyAndSetTrips = useCallback(
    async (candidates: RideRow[], source: string, gen: number) => {
      const ids = new Set<string>();
      for (const row of candidates) {
        if (row?.id) ids.add(row.id);
      }
      const pin = pinnedRideIdRef.current;
      if (pin) ids.add(pin);
      const activeHint = readDriverActiveRideId();
      if (activeHint) ids.add(activeHint);
      const terminalHint =
        candidates.length === 0 && !activeHint && !pin
          ? readDriverTerminalRideId()
          : null;
      if (terminalHint) ids.add(terminalHint);

      const verified: RideRow[] = [];
      let terminalPin: RideRow | null = null;

      for (const id of ids) {
        const fresh = await fetchRideRowById<RideRow>(id);
        if (!fresh?.id) continue;
        if (isDriverActiveTrip(fresh)) {
          verified.push(fresh);
        } else if (id === pin && isTerminalDriverTrip(fresh.status)) {
          terminalPin = fresh;
        } else if (id === terminalHint && isTerminalDriverTrip(fresh.status)) {
          terminalPin = fresh;
        }
      }

      for (const row of candidates) {
        if (!row?.id || !isDriverActiveTrip(row)) continue;
        if (verified.some((v) => v.id === row.id)) continue;
        verified.push(row);
      }

      const latch = completedTicketLatchRef.current;
      const latchedTicket =
        latch && Date.now() < latch.until
          ? normalizeTicketKey(latch.ticket)
          : "";
      const pinnedTicket = readDriverActiveTicket();
      const filtered = latchedTicket
        ? verified.filter((row) => {
            const ticket = normalizeTicketKey(row.ticket_code);
            if (pinnedTicket && ticket === pinnedTicket) return true;
            return ticket !== latchedTicket;
          })
        : verified;

      if (gen !== syncGenRef.current) return;

      const activeTicketPin = readDriverActiveTicket();
      const terminalSessionId = readDriverTerminalRideId();
      if (
        terminalSessionId &&
        filtered.length === 0 &&
        !activeTicketPin &&
        !urlTicketRef.current
      ) {
        const terminalFresh = await fetchRideRowById<RideRow>(terminalSessionId);
        if (gen !== syncGenRef.current) return;
        if (terminalFresh?.id && isTerminalDriverTrip(terminalFresh.status)) {
          applyServerTrips([], source, true);
          setCompletedNotice(terminalFresh);
          setSyncDebug({
            source,
            at: new Date().toLocaleTimeString(),
            apiCount: 0,
            apiSummary: `${terminalFresh.status}${terminalFresh.ticket_code ? ` · ${terminalFresh.ticket_code}` : ""}`,
            uiCount: 0,
            mismatch: false,
          });
          return;
        }
      }

      if (pin && terminalPin?.id === pin) {
        pinnedRideIdRef.current = null;
        clearDriverActiveRideId();
        stripRideFromBrowserUrl();
      }

      const bestFiltered = sortDriverTrips(filtered)[0] ?? null;
      const bestCandidate =
        sortDriverTrips(candidates.filter((row) => row?.id && isDriverActiveTrip(row)))[0] ?? null;
      if (bestFiltered) {
        applyServerTrips([bestFiltered], source, false);
      } else if (bestCandidate) {
        applyServerTrips([bestCandidate], source, false);
      } else if (tripsRef.current.some(isDriverActiveTrip)) {
        return;
      } else {
        applyServerTrips([], source, true);
      }
      if (filtered.length === 0 && terminalPin) {
        setCompletedNotice(terminalPin);
        rememberDriverTerminalRideId(terminalPin.id, terminalPin.ticket_code);
      } else if (bestFiltered && !latchedTicket) {
        rememberDriverActiveRideId(bestFiltered.id);
        pinnedRideIdRef.current = bestFiltered.id;
        setCompletedNotice(null);
        clearDriverTerminalRideId();
        clearDriverCompletedTicketLatch();
        setActionSuccess(null);
      } else if (filtered.length === 0 && latchedTicket) {
        setTrips([]);
      }
    },
    [applyServerTrips],
  );

  const rememberApprovedDriver = useCallback((driver: DriverOnline | null | undefined) => {
    if (driver?.is_active_driver) {
      lastApprovedDriverRef.current = driver;
      driverApprovedRef.current = true;
      setDriverApproved(true);
    }
  }, []);

  const mergeDriverOnline = useCallback((incoming: DriverOnline | null | undefined): DriverOnline | null => {
    if (incoming?.is_active_driver) lastApprovedDriverRef.current = incoming;
    const latchActive = onlineLatchUntilRef.current > Date.now();
    // While latch is active, protect against stale offline/null polls without dropping approval.
    if (latchActive && (!incoming || incoming.is_online === false)) {
      const base = incoming ?? lastApprovedDriverRef.current;
      return base ? { ...base, is_online: true } : null;
    }
    return incoming ?? null;
  }, []);

  const load = useCallback(async (source = "poll") => {
    const bypassLatch =
      source === "mount" ||
      source === "url-pin" ||
      source === "recover" ||
      source === "manual";
    if (Date.now() < actionLatchUntilRef.current && !bypassLatch) {
      return;
    }
    const gen = ++syncGenRef.current;
    const skipExplicitRide = Boolean(
      completedTicketLatchRef.current &&
        Date.now() < completedTicketLatchRef.current.until,
    );
    const ticketHint =
      urlTicketRef.current || readDriverActiveTicket() || undefined;
    const rideIdHint =
      pinnedRideIdRef.current ?? readDriverActiveRideId() ?? undefined;
    let truthApplied = false;
    if (ticketHint || rideIdHint) {
      const fast = await fetchDriverRecoverByTicket(ticketHint ?? "", rideIdHint);
      if (gen !== syncGenRef.current) return;
      if (fast.ok && fast.trips.length > 0) {
        const incoming = fast.trips[0] as RideRow;
        const cur = tripsRef.current[0];
        if (
          !cur?.id ||
          cur.id === incoming.id ||
          (cur.ticket_code &&
            incoming.ticket_code &&
            normalizeTicketKey(cur.ticket_code) === normalizeTicketKey(incoming.ticket_code))
        ) {
          if (!cur || rideStatusRank(incoming.status) >= rideStatusRank(cur.status)) {
            rememberDriverActiveRideId(incoming.id);
            const ticket = normalizeTicketKey(incoming.ticket_code ?? ticketHint);
            if (ticket) rememberDriverActiveTicket(ticket);
            pinnedRideIdRef.current = incoming.id;
            recoverLatchUntilRef.current = Date.now() + 45_000;
            applyServerTrips([incoming], `${source}+recover-first`);
            setPanelError(null);
            setActionError(null);
            truthApplied = true;
            if (incoming.status === "completed" || incoming.status === "cancelled") {
              setCompletedNotice(incoming);
              return;
            }
          }
        }
      }
    }

    if (truthApplied && !PANEL_DISCOVERY_SOURCES.has(source)) {
      return;
    }

    if (
      (ticketHint || rideIdHint) &&
      !truthApplied &&
      !PANEL_DISCOVERY_SOURCES.has(source)
    ) {
      return;
    }
    const syncRideId = skipExplicitRide
      ? undefined
      : pinnedRideIdRef.current ?? readDriverActiveRideId() ?? undefined;
    const panelTicket =
      urlTicketRef.current || readDriverActiveTicket() || undefined;
    const panelResult = await fetchDriverPanel(syncRideId, panelTicket);
    if (gen !== syncGenRef.current) return;
    if (!panelResult.ok) {
      if (
        tripsRef.current.length > 0 &&
        panelResult.status !== 401 &&
        panelResult.status !== 404
      ) {
        return;
      }
      if (panelResult.status === 404) {
        if (tripsRef.current.length === 0) {
          setPanelError(t.ridesDisabled);
          setDriverApproved(false);
          driverApprovedRef.current = false;
        } else {
          setPanelError(null);
        }
      } else if (panelResult.status === 401) {
        setPanelError(t.panelLoadFailed);
      } else {
        setPanelError(t.panelLoadFailed);
      }
      return;
    }

    const panel = panelResult.payload;
    const hideTickets = panel.hide_tickets ?? [];
    let candidates = filterDriverPanelTrips(
      (panel.trips ?? []) as RideRow[],
      hideTickets,
      completedTicketLatchRef.current,
    );
    const skipActiveFallback = Boolean(
      completedTicketLatchRef.current &&
        Date.now() < completedTicketLatchRef.current.until,
    );
    if (candidates.length === 0 && !skipActiveFallback && !ticketHint && !rideIdHint) {
      const activeFallback = filterDriverPanelTrips(
        (await fetchActiveDriverTrips()) as RideRow[],
        hideTickets,
        completedTicketLatchRef.current,
      );
      if (activeFallback.length > 0) candidates = activeFallback;
    }

    const isBackgroundPoll =
      source === "poll" ||
      source === "poll-backup" ||
      source === "SSE" ||
      source === "focus" ||
      source === "visibility";
    if (candidates.length === 0 && tripsRef.current.length > 0) {
      if (panel.driver) {
        rememberApprovedDriver(panel.driver as DriverOnline);
        setOnline(mergeDriverOnline(panel.driver as DriverOnline));
      }
      setCanonicalUserId(panel.canonical_user_id ?? panel.driver?.user_id ?? null);
      setSessionUserId(panel.session_user_id ?? null);
      if (isBackgroundPoll || Date.now() < recoverLatchUntilRef.current) {
        setPanelError(null);
        return;
      }
    }

    if (candidates.length > 0) {
      const top = candidates[0];
      if (top?.id) rememberDriverActiveRideId(top.id);
      if (top?.ticket_code) rememberDriverActiveTicket(top.ticket_code);
      if (urlTicketRef.current) urlTicketRef.current = null;
      setCompletedNotice(null);
      setPanelError(null);
      const ticketForTruth = normalizeTicketKey(top.ticket_code ?? ticketHint ?? "");
      const truthResult = await fetchDriverRecoverByTicket(
        ticketForTruth || "",
        top.id ?? rideIdHint,
      );
      if (gen !== syncGenRef.current) return;
      if (truthResult.ok && truthResult.trips.length > 0) {
        applyServerTrips([truthResult.trips[0] as RideRow], `${source}+events`);
      } else {
        applyServerTrips(candidates, source);
      }
    }

    if (panel.driver) {
      rememberApprovedDriver(panel.driver as DriverOnline);
      setOnline(mergeDriverOnline(panel.driver as DriverOnline));
    } else {
      setOnline(null);
      if (!driverApprovedRef.current) {
        setDriverApproved(false);
      }
    }
    setCanonicalUserId(panel.canonical_user_id ?? panel.driver?.user_id ?? null);
    setSessionUserId(panel.session_user_id ?? null);
    if (!panel.driver?.is_active_driver && panel.driver !== null) {
      setPanelError(t.inactiveDriverShort);
      setDriverApproved(false);
      driverApprovedRef.current = false;
    } else if (!panel.driver && !panel.canonical_user_id) {
      setPanelError(t.noDriverProfile);
      if (!driverApprovedRef.current) setDriverApproved(false);
    } else {
      setPanelError(null);
    }
    if (candidates.length === 0 && tripsRef.current.length > 0) {
      setPanelError(null);
    }
  }, [
    applyServerTrips,
    mergeDriverOnline,
    rememberApprovedDriver,
    t.panelLoadFailed,
    t.inactiveDriverShort,
    t.noDriverProfile,
    t.ridesDisabled,
  ]);

  const applyRecoveredTrip = useCallback(
    (row: RideRow, ticketHint?: string) => {
      rememberDriverActiveRideId(row.id);
      const ticket = normalizeTicketKey(row.ticket_code ?? ticketHint);
      if (ticket) rememberDriverActiveTicket(ticket);
      pinnedRideIdRef.current = row.id;
      syncGenRef.current += 1;
      recoverLatchUntilRef.current = Date.now() + 45_000;
      applyServerTrips([row], "recover");
      setCompletedNotice(null);
      setPanelError(null);
      setActionError(null);
    },
    [applyServerTrips],
  );

  const recoverAssignedRide = useCallback(async () => {
    setBusy("recover");
    setPanelError(null);
    setActionError(null);
    clearDriverTerminalRideId();
    clearDriverCompletedTicketLatch();
    completedTicketLatchRef.current = null;
    setCompletedNotice(null);

    const ticket = normalizeTicketKey(
      recoverTicketInput || readDriverActiveTicket() || urlTicketRef.current || "",
    );
    if (ticket) {
      urlTicketRef.current = ticket;
      rememberDriverActiveTicket(ticket);
    }

    const rideIdHint =
      readDriverActiveRideId() ||
      pinnedRideIdRef.current ||
      String(searchParams.get("ride") ?? "").trim() ||
      undefined;

    if (ticket || rideIdHint) {
      const fast = await fetchDriverRecoverByTicket(ticket, rideIdHint);
      if (fast.ok && fast.trips.length > 0) {
        applyRecoveredTrip(fast.trips[0] as RideRow, ticket);
        setBusy(null);
        return;
      }
      if (!fast.ok && fast.status === 401) {
        setPanelError(t.panelLoadFailed);
        setBusy(null);
        return;
      }
    }

    const rideId = rideIdHint ?? null;
    if (rideId) {
      const direct = await fetchRideRowById<RideRow>(rideId);
      if (direct?.id && isDriverActiveTrip(direct)) {
        applyRecoveredTrip(direct, ticket || direct.ticket_code || undefined);
        setBusy(null);
        return;
      }
    }

    if (ticket) {
      const panelResult = await fetchDriverPanel(rideId ?? undefined, ticket);
      if (panelResult.ok) {
        const raw = (panelResult.payload.trips ?? []) as RideRow[];
        const row = raw.find((r) => r?.id && isDriverActiveTrip(r)) ?? raw[0];
        if (row?.id && isDriverActiveTrip(row)) {
          applyRecoveredTrip(row, ticket);
          setBusy(null);
          return;
        }
      }
    }

    setActionError(t.recoverFailed);
    setBusy(null);
  }, [
    applyRecoveredTrip,
    recoverTicketInput,
    searchParams,
    t.panelLoadFailed,
    t.recoverFailed,
  ]);

  useEffect(() => {
    const sessionTicket = readDriverActiveTicket();
    if (sessionTicket && !recoverTicketInput) {
      setRecoverTicketInput(sessionTicket);
    }
  }, [recoverTicketInput]);

  useEffect(() => {
    if (!readDriverActiveRideId() && !readDriverTerminalRideId()) {
      // No active or recently completed ride — safe to clear the latch.
      clearDriverCompletedTicketLatch();
      completedTicketLatchRef.current = null;
    } else if (!readDriverActiveRideId() && readDriverTerminalRideId()) {
      // Page was refreshed after completing a ride — restore latch from sessionStorage
      // so the completed ticket doesn't reappear as Step 1.
      const ticket = readDriverCompletedTicketLatch();
      if (ticket) {
        completedTicketLatchRef.current = { ticket, until: Date.now() + 120_000 };
      }
    }
  }, []);

  useEffect(() => {
    const id = searchParams.get("ride")?.trim();
    const ticket = normalizeTicketKey(String(searchParams.get("ticket") ?? "").trim());
    if (ticket) {
      urlTicketRef.current = ticket;
      rememberDriverActiveTicket(ticket);
      setRecoverTicketInput(ticket);
      // New assignment link — do not let a prior completed trip hide this ticket.
      clearDriverTerminalRideId();
      clearDriverCompletedTicketLatch();
      completedTicketLatchRef.current = null;
      setCompletedNotice(null);
      void recoverAssignedRide();
    }
    stripRideFromBrowserUrl();

    if (!id) {
      if (!ticket) void load("url-pin");
      return;
    }

    pinnedRideIdRef.current = id;
    void (async () => {
      const row = await fetchRideRowById<RideRow>(id);
      if (row?.id && isTerminalDriverTrip(row.status)) {
        rememberDriverTerminalRideId(row.id, row.ticket_code);
        if (row.ticket_code) {
          completedTicketLatchRef.current = {
            ticket: row.ticket_code,
            until: Date.now() + 120_000,
          };
        }
        clearDriverActiveRideId();
        pinnedRideIdRef.current = null;
        setTrips([]);
        setCompletedNotice(row);
        setSyncDebug({
          source: "url-pin",
          at: new Date().toLocaleTimeString(),
          apiCount: 0,
          apiSummary: `${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`,
          uiCount: 0,
          mismatch: false,
        });
        return;
      }
      rememberDriverActiveRideId(id);
      completedTicketLatchRef.current = null;
      clearDriverCompletedTicketLatch();
      void load("url-pin");
    })();
  }, [searchParams, load, recoverAssignedRide]);

  const displayError = actionError ?? panelError;
  const isOnline = Boolean(online?.is_online);
  const canGoOnline = driverApproved || Boolean(online?.is_active_driver);
  const panelStreamEnabled = !panelError && Boolean(canonicalUserId ?? online?.user_id);

  useEffect(() => {
    void fetchRidesEnabledOnServer().then((enabled) => {
      setRidesDisabledOnServer(!enabled);
    });
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) return;
        const name = String(d.user.display_name ?? "").trim();
        const phone = String(d.user.phone ?? "").trim();
        setSessionPhone(phone || null);
        const tail = phone.length >= 4 ? phone.slice(-4) : "";
        setSessionLabel(
          name ? `${name}${tail ? ` · …${tail}` : ""}` : phone || String(d.user.id).slice(0, 8),
        );
      })
      .catch(() => {});
  }, []);

  const wrongDriverAccount =
    trips.length === 0 &&
    Boolean(sessionUserId && canonicalUserId) &&
    sessionUserId!.toLowerCase() !== canonicalUserId!.toLowerCase();

  const showWrongAccountHint = trips.length === 0 && (!canGoOnline || wrongDriverAccount);

  const isRiderTestSession =
    Boolean(sessionPhone) &&
    (sessionPhone!.endsWith("8527") || sessionPhone!.includes("7326908527"));
  const isDriverTestSession =
    Boolean(sessionPhone) &&
    (sessionPhone!.endsWith("6902") || sessionPhone!.includes("4151816902"));

  const connectBlockedMessage = isRiderTestSession
    ? t.connectBlockedRiderSession
    : isDriverTestSession
      ? t.connectBlockedDriverSession
      : t.connectBlockedHint;

  const runTripsDebug = async () => {
    setDebugBusy(true);
    try {
      const r = await fetch("/api/rides-drivers-trips-debug", {
        credentials: "include",
        cache: "no-store",
      });
      if (r.status === 404) {
        setDebugChecks([t.ridesDisabled]);
        return;
      }
      const data = await r.json().catch(() => ({}));
      setDebugChecks(Array.isArray(data.checks) ? data.checks : [t.panelLoadFailed]);
    } catch {
      setDebugChecks([t.panelLoadFailed]);
    } finally {
      setDebugBusy(false);
    }
  };

  const refreshOnlineStatus = useCallback(async () => {
    const r = await fetch("/api/rides/drivers/me/online", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (data.driver) {
      rememberApprovedDriver(data.driver as DriverOnline);
      setOnline(mergeDriverOnline(data.driver as DriverOnline));
    }
    return data.driver as DriverOnline | undefined;
  }, [mergeDriverOnline, rememberApprovedDriver]);

  useRideLiveStream({
    streamUrl: panelStreamEnabled ? "/api/rides/drivers/me/stream" : null,
    enabled: panelStreamEnabled,
    onEvent: (payload) => {
      const data = payload as {
        driver?: DriverOnline | null;
        trips?: RideRow[];
        canonical_user_id?: string | null;
      };
      if (data.driver) {
        rememberApprovedDriver(data.driver);
        setOnline(mergeDriverOnline(data.driver));
      }
      void load("SSE");
      if (data.canonical_user_id) setCanonicalUserId(data.canonical_user_id);
    },
    fallbackPollMs: 12_000,
    onFallbackPoll: () => void load("poll-backup"),
  });

  useEffect(() => {
    void load("mount");
    void refreshOnlineStatus();
    const retry = setTimeout(() => {
      if (!driverApprovedRef.current) {
        void load("mount-retry");
        void refreshOnlineStatus();
      }
    }, 2_500);
    const ms =
      trips.length > 0 && trips.some((t) => t.status === "accepted" || t.status === "arrived" || t.status === "in_trip")
        ? 700
        : trips.length > 0
          ? 3_000
          : isOnline
            ? 2_000
            : 8_000;
    const timer = setInterval(() => void load("poll"), ms);
    return () => {
      clearTimeout(retry);
      clearInterval(timer);
    };
  }, [load, refreshOnlineStatus, isOnline, trips.length]);

  useEffect(() => {
    const onFocus = () => void load("focus");
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (trips.length > 0 || debugChecks !== null || debugBusy) return;
    const timer = setTimeout(() => void runTripsDebug(), 12_000);
    return () => clearTimeout(timer);
  }, [trips.length, debugChecks, debugBusy]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load("pageshow");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  // visibilitychange fires when user returns to this tab from WhatsApp in-app
  // browser or any other app — re-syncs the panel immediately on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load("visibility");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const toggleOnline = async (next: boolean) => {
    setBusy("online");
    setActionError(null);
    setGpsNotice(null);
    try {
      const r = await fetch("/api/rides/drivers/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionError(data?.error ?? t.toggleFailed);
        return;
      }
      const driver = data.driver as DriverOnline | undefined;
      if (driver) {
        if (next) onlineLatchUntilRef.current = Date.now() + 600_000;
        else onlineLatchUntilRef.current = 0;
        setOnline(mergeDriverOnline({ ...driver, is_online: next }));
      }
      await load("online-toggle");

      if (!next) return;

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGpsNotice(t.gpsDenied);
        await refreshOnlineStatus();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const gps = await fetch("/api/rides/drivers/me/location", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });
          const gpsData = await gps.json().catch(() => ({}));
          if (!gps.ok) {
            setGpsNotice(gpsData?.error ?? t.gpsPingFailed);
            await refreshOnlineStatus();
            return;
          }
          if (gpsData.driver) setOnline(mergeDriverOnline(gpsData.driver as DriverOnline));
          setGpsNotice(null);
          await load("gps");
        },
        async () => {
          setGpsNotice(t.gpsDenied);
          await refreshOnlineStatus();
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
      );
    } finally {
      setBusy(null);
    }
  };

  const primaryTripForGps = trips.find(isDriverActiveTrip) ?? null;
  useDriverGpsPing({
    enabled: isOnline || Boolean(primaryTripForGps),
    rideId: primaryTripForGps?.id ?? null,
  });

  const action = async (rideId: string, path: string, body?: Record<string, unknown>) => {
    setBusy(rideId + path);
    setActionError(null);
    setActionSuccess(null);
    // Set all latches BEFORE the fetch — Supabase Realtime SSE fires the moment
    // the DB write commits server-side, which is mid-request before the HTTP
    // response arrives. Any latch set after await fetch() is too late.
    if (onlineLatchUntilRef.current > 0) {
      onlineLatchUntilRef.current = Date.now() + 600_000;
    }
    if (path === "complete") {
      // Pre-set completed ticket latch using the ticket from current trips state
      // so the SSE-triggered load() during the request already sees it filtered.
      const tripTicket = trips.find((t) => t.id === rideId)?.ticket_code ?? null;
      if (tripTicket) {
        completedTicketLatchRef.current = {
          ticket: tripTicket,
          until: Date.now() + 120_000,
        };
      }
    }
    try {
      const r = await fetch(`/api/rides/${rideId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const raw = String(data?.error ?? "");
        setActionError(
          raw.includes("cancelled") ? t.tripAlreadyCancelled : raw || t.actionFailed,
        );
        await refreshTripById(rideId);
        void load("action-error");
        return;
      }

      const rideFromAction = data.ride as RideRow | undefined;

      if (path === "complete") {
        // Keep online latch alive — trip actions can take longer than the 90s
        // Conectar latch; without this, stale is_online=false from the replica
        // shows the driver as offline immediately after completing a ride.
        if (onlineLatchUntilRef.current > 0) {
          onlineLatchUntilRef.current = Date.now() + 600_000;
        }
        // Set latch BEFORE incrementing gen — prevents any poll that fires in the
        // gap between syncGenRef++ and latch assignment from showing a stale matched trip.
        const earlyTicket = rideFromAction?.ticket_code ?? null;
        if (earlyTicket) {
          completedTicketLatchRef.current = {
            ticket: earlyTicket,
            until: Date.now() + 120_000,
          };
        }
        syncGenRef.current += 1;
        statusFloorByRideRef.current.delete(rideId);
        setTrips([]);
        pinnedRideIdRef.current = null;
        clearDriverActiveRideId();
        stripRideFromBrowserUrl();
        let completedRow = rideFromAction ?? null;
        if (!completedRow?.id) {
          completedRow = await fetchRideRowById<RideRow>(rideId);
        }
        if (completedRow?.ticket_code && !completedTicketLatchRef.current) {
          completedTicketLatchRef.current = {
            ticket: completedRow.ticket_code,
            until: Date.now() + 120_000,
          };
        }
        if (completedRow?.id) rememberDriverTerminalRideId(completedRow.id, completedRow.ticket_code);
        setCompletedNotice(completedRow);
        setActionSuccess(t.completeSuccess);
        return;
      }

      if (rideFromAction?.id) {
        actionLatchUntilRef.current = Date.now() + 4_000;
        // Extend online latch so stale is_online=false polls don't mark driver
        // offline during active trip processing (accept → arrive → start).
        if (onlineLatchUntilRef.current > 0) {
          onlineLatchUntilRef.current = Date.now() + 600_000;
        }
        syncGenRef.current += 1;
        statusFloorByRideRef.current.set(
          rideFromAction.id,
          rideStatusRank(rideFromAction.status),
        );
        rememberDriverActiveRideId(rideFromAction.id);
        pinnedRideIdRef.current = rideFromAction.id;
        if (path === "accept") {
          clearDriverTerminalRideId();
          setCompletedNotice(null);
          completedTicketLatchRef.current = null;
        }
        upsertTripFromAction(rideFromAction);
      } else {
        setTrips((prev) => prev.filter((t) => t.id !== rideId));
      }

      await refreshTripById(rideId);

      if (path === "accept") setActionSuccess(t.acceptSuccess);
      else if (path === "arrive") setActionSuccess(t.arriveSuccess);
      else if (path === "start") setActionSuccess(t.startSuccess);
    } finally {
      setBusy(null);
    }
  };

  const primaryTrip = trips[0] ?? null;

  return (
    <main className="min-h-screen bg-[#F8F4ED] text-[#1B4332]">
      <div className="mx-auto max-w-lg px-4 py-8">
        <RidesStagingBanner />

        {ridesDisabledOnServer && (
          <div className="mb-4 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-950">
            <p>{t.ridesDisabled}</p>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="mt-1 text-sm text-[#1B4332]/70">{t.subtitle}</p>
          </div>
          <Link href={withLang("/conductor", lang)} className="text-sm font-medium underline">
            {t.profile}
          </Link>
        </div>

        {sessionLabel && (
          <div
            className={`mb-3 rounded-lg border px-4 py-3 text-sm ${
              isDriverTestSession
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : isRiderTestSession
                  ? "border-red-300 bg-red-50 text-red-950"
                  : "border-[#1B4332]/15 bg-white/90 text-[#1B4332]/80"
            }`}
          >
            <p>
              {t.loggedInAs} <strong>{sessionLabel}</strong>
              {sessionPhone && (
                <span className="block font-mono text-xs mt-0.5 opacity-80">{sessionPhone}</span>
              )}
            </p>
            {isRiderTestSession && (
              <p className="mt-2 text-xs font-medium">{t.riderAccountOnDriverPanel}</p>
            )}
            {isDriverTestSession && canGoOnline && (
              <p className="mt-2 text-xs">{t.driverAccountOk}</p>
            )}
            {!canGoOnline && !isRiderTestSession && (
              <span className="block mt-1 text-amber-800">{t.driverPhoneHint}</span>
            )}
          </div>
        )}

        {showWrongAccountHint && (
          <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t.wrongAccountForTrips}
          </div>
        )}

        {trips.length === 0 && !ridesDisabledOnServer && (
          <div className="mb-4 rounded-lg border border-[#1B4332]/15 bg-white/90 px-4 py-3 text-sm">
            <button
              type="button"
              disabled={debugBusy}
              onClick={() => void runTripsDebug()}
              className="font-medium underline disabled:opacity-50"
            >
              {debugBusy ? "…" : t.diagnoseTrips}
            </button>
            {debugChecks && debugChecks.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-[#1B4332]/80 space-y-1">
                {debugChecks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
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
            {formatSyncDebug(syncDebug)}
            {" · "}
            <button type="button" className="underline" onClick={() => void load("manual")}>
              refresh
            </button>
          </p>
        )}

        {!online?.is_active_driver && online !== null && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            {t.inactiveDriverPrefix}
            <Link href={withLang("/conductor", lang)} className="underline">
              /conductor
            </Link>
            {t.inactiveDriverSuffix}
          </div>
        )}

        {displayError && (
          <div
            className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {displayError}
          </div>
        )}

        {actionSuccess && (
          <div
            className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            {actionSuccess}
          </div>
        )}

        {gpsNotice && (
          <div
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            {gpsNotice}
          </div>
        )}

        {completedNotice ? (
          <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-medium">{t.tripCompletedBanner}</p>
            {completedNotice.ticket_code && (
              <p className="mt-1 font-mono font-bold">{completedNotice.ticket_code}</p>
            )}
            <p className="mt-1 text-xs opacity-80">
              {rideRouteSummaryFromRow(completedNotice, lang).route_label}
            </p>
          </div>
        ) : trips.length === 0 ? (
          <div className="mb-6 space-y-2">
            <p className="text-sm text-[#1B4332]/70">{t.noActiveTrips}</p>
            <input
              className="w-full rounded-lg border border-[#1B4332]/20 px-3 py-2 text-sm font-mono"
              placeholder={t.recoverTicketPlaceholder}
              value={recoverTicketInput}
              onChange={(e) => setRecoverTicketInput(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              disabled={busy === "recover"}
              onClick={() => void recoverAssignedRide()}
              className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy === "recover" ? t.loadingAssignedRide : t.loadAssignedRide}
            </button>
            {canonicalUserId && (
              <p className="text-xs text-[#1B4332]/50 leading-relaxed">
                {t.staleTripHint}{" "}
                {t.driverIdLabel}{" "}
                <span className="font-mono">{canonicalUserId.slice(0, 8)}…</span>
              </p>
            )}
          </div>
        ) : primaryTrip ? (
          <ul className="mb-6 space-y-4">
            {(() => {
              const trip = primaryTrip;
              const stepIdx = driverFlowStepIndex(trip.status);
              const currentStep =
                stepIdx >= 0 ? driverFlowSteps(lang)[stepIdx] : null;
              return (
                <li key={trip.id} className="rounded-2xl bg-white p-5 shadow-sm space-y-3 border-2 border-emerald-400">
                  {currentStep && (
                    <p className="text-xs font-semibold text-emerald-800">
                      Paso {stepIdx + 1}: {currentStep.buttonLabel}
                    </p>
                  )}
                  <p className="text-xs uppercase tracking-wide text-[#1B4332]/60">
                    {rideStatusLabel(trip.status, lang)}
                  </p>
                  <p className="font-medium">
                    {trip.pickup_address} → {trip.dropoff_address}
                  </p>
                  <p className="text-sm text-[#1B4332]/70">
                    {t.estFare} {formatCurrencyMXN(trip.estimated_total_mxn_cents, lang)}
                  </p>
                  {trip.ticket_code && (
                    <p className="text-sm">
                      {t.passengerCode}{" "}
                      <span className="font-mono font-bold">{trip.ticket_code}</span>
                    </p>
                  )}
                  <p className="text-xs text-[#1B4332]/50">
                    {driverTripActionHint(trip.status, lang)}
                  </p>

                  {trip.status === "matched" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => action(trip.id, "accept")}
                      className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {t.acceptRide}
                    </button>
                  )}
                  {trip.status === "accepted" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => action(trip.id, "arrive")}
                      className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {t.arrivedAtPickup}
                    </button>
                  )}
                  {trip.status === "arrived" && (
                    <div className="flex flex-wrap gap-2 items-end">
                      <input
                        className="rounded-lg border border-[#1B4332]/20 px-3 py-2 text-sm font-mono"
                        placeholder={t.ticketPlaceholder}
                        value={ticketByRide[trip.id] ?? trip.ticket_code ?? ""}
                        onChange={(e) =>
                          setTicketByRide((m) => ({ ...m, [trip.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() =>
                          action(trip.id, "start", {
                            ticket_code: (ticketByRide[trip.id] ?? trip.ticket_code ?? "").trim(),
                          })
                        }
                        className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {t.startRide}
                      </button>
                    </div>
                  )}
                  {trip.status === "in_trip" && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => action(trip.id, "complete")}
                      className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {t.completeRide}
                    </button>
                  )}
                </li>
              );
            })()}
          </ul>
        ) : null}

        <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{isOnline ? t.online : t.offline}</p>
              <p className="text-sm text-[#1B4332]/70">
                {isOnline ? t.onlineHint : t.offlineHint}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === "online" || !canGoOnline}
              onClick={() => toggleOnline(!isOnline)}
              className={`rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                isOnline ? "bg-amber-700" : "bg-[#1B4332]"
              }`}
            >
              {busy === "online" ? "…" : isOnline ? t.disconnect : t.connect}
            </button>
          </div>
          {!canGoOnline && ridesDisabledOnServer && (
            <p className="mt-3 text-xs text-amber-800 leading-relaxed">{t.ridesDisabled}</p>
          )}
          {!canGoOnline && !ridesDisabledOnServer && sessionUserId && (
            <p className="mt-3 text-xs text-amber-800 leading-relaxed">{connectBlockedMessage}</p>
          )}
        </section>

        {isOnline && primaryTrip && (
          <section className="mb-6 rounded-2xl border border-[#1B4332]/15 bg-white/80 p-4 text-sm">
            <p className="font-medium">{t.flowGuideTitle}</p>
            <p className="mt-1 text-xs text-[#1B4332]/60 leading-relaxed">{t.flowWhereHint}</p>
            <ol className="mt-3 space-y-2">
              {driverFlowSteps(lang).map((step, i) => {
                const activeIdx = driverFlowStepIndex(primaryTrip.status);
                const isCurrent = i === activeIdx;
                const isDone = activeIdx >= 0 && i < activeIdx;
                return (
                  <li
                    key={step.key}
                    className={`flex gap-2 rounded-lg px-2 py-1 ${
                      isCurrent
                        ? "bg-emerald-50 font-medium text-emerald-900"
                        : isDone
                          ? "text-[#1B4332]/50 line-through"
                          : "text-[#1B4332]/80"
                    }`}
                  >
                    <span className="font-mono text-xs w-5 shrink-0">{i + 1}.</span>
                    <span>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
