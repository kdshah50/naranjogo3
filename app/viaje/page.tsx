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
  fetchActiveBuyerRide,
  fetchBuyerCompletedDisplayRide,
  fetchCanonicalRideByTicket,
  fetchRideRowById,
  fetchRideSync,
  type RideDriverPublic,
} from "@/lib/rides/client-ride-sync";
import { mergeRideStatusRow, rideStatusRank } from "@/lib/rides/ride-status-merge";
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
  pickup_address: string;
  dropoff_address: string;
  estimated_total_mxn_cents: number;
  hold_amount_mxn_cents: number;
  final_total_mxn_cents?: number | null;
  ticket_code: string | null;
  driver_id: string | null;
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
    apiSummary = isBuyerActiveStatus(row.status)
      ? `1 open · ${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`
      : `not open · ${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""}`;
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

/** Pinned ride fallback when sync API fails. */
async function fetchOpenPinnedRide(rideId: string): Promise<RideRow | null> {
  const truth = await fetchRideRowById<RideRow>(rideId);
  return truth && isBuyerActiveStatus(truth.status) ? truth : null;
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

  /** Server wins via GET /api/rides/sync — single source of truth. */
  const refreshActiveRide = useCallback(async (source = "poll") => {
    const seq = ++refreshSeqRef.current;
    const isStale = () => seq !== refreshSeqRef.current;

    const pinnedId = rideIdRef.current ?? readPinnedRideId();
    const ticketHint =
      urlTicketRef.current || activeTicketRef.current || readPinnedTicket() || undefined;
    // WhatsApp deep links pin a ride id; ongoing polls use ticket-canonical sync so
    // accept/arrive/start from the driver are not stuck on stale "matched" reads.
    const ticketOnlyPoll =
      Boolean(ticketHint) &&
      (source === "poll" ||
        source === "poll-backup" ||
        source === "visibility" ||
        source === "focus" ||
        source === "pageshow" ||
        source === "manual");
    const syncRideId = ticketOnlyPoll ? undefined : pinnedId ?? undefined;
    const skipDismissed =
      hadUrlRideParamsRef.current &&
      (source === "mount" || source === "mount-retry");
    const dismissedForSync = skipDismissed ? undefined : readDismissedTicket() || undefined;
    const syncResult = await fetchRideSync(
      syncRideId,
      ticketHint || undefined,
      dismissedForSync,
    );

    // Fast path — paint sync row immediately (races were dropping active trips).
    if (syncResult.ok) {
      const fastRow = syncResult.payload.ride as RideRow | null;
      if (fastRow?.id && (isBuyerActiveStatus(fastRow.status) || isTerminalRideStatus(fastRow.status))) {
        clearDismissedTicket();
        userClearedUntilRef.current = 0;
        writeUserClearedUntil(0);
        repinCanonicalRideId(fastRow, rideIdRef, activeTicketRef);
        setDriverPublic(syncResult.payload.driver_public ?? null);
        applyServerRide(
          fastRow,
          `${source}+fast`,
          `${fastRow.status}${fastRow.ticket_code ? ` · ${fastRow.ticket_code}` : ""}`,
          syncResult.payload.debug?.drop_reason ?? null,
        );
        urlTicketRef.current = null;
      }
    }

    const applyResolvedRide = async (
      row: RideRow,
      src: string,
      note?: string,
      dropReason?: string | null,
    ) => {
      let resolved = row;
      const fresh = await fetchRideRowById<RideRow>(row.id);
      if (fresh?.id) resolved = mergeRideStatusRow(row, fresh);
      resolved = await resolveRowByTicketCanonical(resolved);
      repinCanonicalRideId(resolved, rideIdRef, activeTicketRef);
      if (!isStale()) {
        applyServerRide(
          resolved,
          src,
          note ??
            (isBuyerActiveStatus(resolved.status) || isTerminalRideStatus(resolved.status)
              ? `${resolved.status}${resolved.ticket_code ? ` · ${resolved.ticket_code}` : ""}`
              : undefined),
          dropReason ?? null,
        );
      }
    };

    if (!syncResult.ok) {
      if (pinnedId) {
        const pinnedOpen = await fetchOpenPinnedRide(pinnedId);
        if (pinnedOpen && !isStale()) {
          applyServerRide(pinnedOpen, source, "pinned (sync error)");
          return;
        }
      }
      if (!isStale()) {
        setSyncDebug(syncDebugForRow(uiRideRef.current, source, `sync error ${syncResult.status}`));
      }
      return;
    }

    const sync = syncResult.payload;
    if (!uiRideRef.current) setDriverPublic(sync.driver_public ?? null);

    const debugMeta = sync.debug;
    const debugSuffix = debugMeta
      ? ` · pool ${debugMeta.pool_size} · raw ${debugMeta.raw_buyer_count} · verified ${debugMeta.verified_buyer_count}${debugMeta.drop_reason ? ` · ${debugMeta.drop_reason}` : ""}`
      : "";

    const row = sync.ride as RideRow | null;
    if (row?.id) {
      if (!isStale()) {
        await applyResolvedRide(
          row,
          source,
          isBuyerActiveStatus(row.status) || isTerminalRideStatus(row.status)
            ? `${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""}${debugSuffix}`
            : undefined,
          debugMeta?.drop_reason ?? null,
        );
      }
      return;
    }

    const pinnedIdNow = rideIdRef.current ?? readPinnedRideId();
    if (pinnedIdNow) {
      const direct = await fetchRideRowById<RideRow>(pinnedIdNow);
      if (isStale()) return;
      if (direct?.id && isTerminalRideStatus(direct.status)) {
        await applyResolvedRide(
          direct,
          `${source}+direct-terminal`,
          `${direct.status}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
      if (direct?.id && isBuyerActiveStatus(direct.status)) {
        await applyResolvedRide(
          direct,
          `${source}+direct`,
          `${direct.status}${direct.ticket_code ? ` · ${direct.ticket_code}` : ""}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
    }

    const activeFallback = (await fetchActiveBuyerRide()) as RideRow | null;
    if (isStale()) return;
    if (
      activeFallback?.id &&
      isBuyerActiveStatus(activeFallback.status) &&
      !isTicketLatched(activeFallback.ticket_code, completedTicketLatchRef.current)
    ) {
      await applyResolvedRide(
        activeFallback,
        `${source}+active`,
        `${activeFallback.status}${activeFallback.ticket_code ? ` · ${activeFallback.ticket_code}` : ""}${debugSuffix}`,
        debugMeta?.drop_reason ?? null,
      );
      return;
    }

    const dismissedTicket = readDismissedTicket();
    const blockTerminalResurface =
      Boolean(dismissedTicket) ||
      Date.now() < userClearedUntilRef.current;

    const terminalId =
      blockTerminalResurface && POLL_SOURCES.has(source)
        ? null
        : readTerminalRideId() ?? pinnedId;
    if (terminalId) {
      const terminalRow = await fetchRideRowById<RideRow>(terminalId);
      if (isStale()) return;
      if (terminalRow?.id && isTerminalRideStatus(terminalRow.status)) {
        applyServerRide(
          terminalRow,
          `${source}+terminal`,
          `${terminalRow.status}${terminalRow.ticket_code ? ` · ${terminalRow.ticket_code}` : ""}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
      if (terminalRow?.id && isBuyerActiveStatus(terminalRow.status)) {
        applyServerRide(
          terminalRow,
          `${source}+pinned`,
          `${terminalRow.status}${terminalRow.ticket_code ? ` · ${terminalRow.ticket_code}` : ""}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
    }

    if (!isStale() && Date.now() < requestLatchUntilRef.current && pinnedId) {
      return;
    }

    if (pinnedId) {
      const direct = await fetchRideRowById<RideRow>(pinnedId);
      if (isStale()) return;
      if (direct?.id && isTerminalRideStatus(direct.status)) {
        applyServerRide(
          direct,
          `${source}+direct-terminal`,
          `${direct.status}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
      if (direct?.id && isBuyerActiveStatus(direct.status)) {
        applyServerRide(
          direct,
          `${source}+direct`,
          `${direct.status}${direct.ticket_code ? ` · ${direct.ticket_code}` : ""}${debugSuffix}`,
          debugMeta?.drop_reason ?? null,
        );
        return;
      }
    }

    if (!blockTerminalResurface) {
      const heldTerminalId = readTerminalRideId();
      if (heldTerminalId) {
        const held = await fetchRideRowById<RideRow>(heldTerminalId);
        if (!isStale() && held?.id && isTerminalRideStatus(held.status)) {
          applyServerRide(
            held,
            `${source}+terminal-hold`,
            `${held.status}${debugSuffix}`,
            debugMeta?.drop_reason ?? null,
          );
          return;
        }
      }

      if (!POLL_SOURCES.has(source)) {
        const completedDisplay = (await fetchBuyerCompletedDisplayRide()) as RideRow | null;
        if (
          !isStale() &&
          completedDisplay?.id &&
          completedDisplay.status === "completed"
        ) {
          applyServerRide(
            completedDisplay,
            `${source}+display`,
            `completed${completedDisplay.ticket_code ? ` · ${completedDisplay.ticket_code}` : ""}${debugSuffix}`,
            debugMeta?.drop_reason ?? null,
          );
          return;
        }
      }
    }

    if (!isStale()) {
      if (blockTerminalResurface && POLL_SOURCES.has(source) && !ticketHint) {
        setSyncDebug(syncDebugForRow(null, source, `0 open (dismissed)${debugSuffix}`, debugMeta?.drop_reason ?? null));
        return;
      }
      const drop = debugMeta?.drop_reason ?? null;
      const mayClear =
        source === "clear" ||
        source === "cancel" ||
        source === "request" ||
        drop?.startsWith("verify:completed") ||
        drop === "dismissed:completed";
      const keepingActive =
        POLL_SOURCES.has(source) &&
        uiRideRef.current?.id &&
        isBuyerActiveStatus(uiRideRef.current.status) &&
        !mayClear;
      if (keepingActive) {
        setSyncDebug(
          syncDebugForRow(
            uiRideRef.current,
            source,
            `0 open (keeping active trip)${debugSuffix}`,
            drop,
          ),
        );
        return;
      }
      applyServerRide(null, source, `0 open${debugSuffix}`, drop);
    }
  }, [applyServerRide]);

  const recoverActiveTrip = useCallback(() => {
    clearDismissedTicket();
    userClearedUntilRef.current = 0;
    writeUserClearedUntil(0);
    completedTicketLatchRef.current = null;
    void refreshActiveRide("manual");
  }, [refreshActiveRide]);

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
        let row = (payload as { ride?: RideRow }).ride;
        if (!row?.id) return;
        row = await resolveRowByTicketCanonical(row);
        if (seqAtEvent !== refreshSeqRef.current) return;
        repinCanonicalRideId(row, rideIdRef, activeTicketRef);
        applyServerRide(row, "SSE");
        const driverPub = (payload as { driver_public?: RideDriverPublic }).driver_public;
        if (driverPub) setDriverPublic(driverPub);
      })();
    },
    fallbackPollMs: liveRideId ? 4_000 : 8_000,
    onFallbackPoll: () => void refreshActiveRide("poll-backup"),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const rideParam = url.searchParams.get("ride")?.trim();
    const ticketParam = url.searchParams.get("ticket")?.trim();
    if (ticketParam) urlTicketRef.current = normalizeTicketKey(ticketParam);
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
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.user?.id) setAuthError(t.loginRequired);
        else {
          setSessionPhone(String(d.user.phone ?? "").trim() || null);
          void refreshActiveRide("mount");
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 800);
          window.setTimeout(() => void refreshActiveRide("mount-retry"), 2500);
        }
      })
      .catch(() => setAuthError(t.sessionError));
  }, [refreshActiveRide, t.loginRequired, t.sessionError]);

  useEffect(() => {
    if (authError) return;
    const terminal = ride?.status === "completed" || ride?.status === "cancelled";
    const fromWhatsApp = hadUrlRideParamsRef.current;
    const ms = terminal ? 8_000 : ride ? (fromWhatsApp ? 1_500 : 2_000) : 5_000;
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

  const hasBlockingTrip = Boolean(
    (ride && (isBuyerActiveStatus(ride.status) || isTerminalRideStatus(ride.status))) ||
      terminalBanner,
  );

  const canSubmit = useMemo(
    () => pickupColonia !== dropoffColonia && !authError && !hasBlockingTrip,
    [pickupColonia, dropoffColonia, authError, hasBlockingTrip],
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
        const fresh = await fetchRideRowById<RideRow>(rideRow.id);
        if (fresh) applyServerRide(fresh, "request-verify");
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

        {!ride && !authError && !loggedInAsDriver && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">
              {lang === "es" ? "¿Tienes un viaje activo?" : "Have an active trip?"}
            </p>
            <p className="mt-1">
              {lang === "es"
                ? "Si pediste un taxi y no ves tu ticket, pulsa abajo — no pidas otro viaje todavía."
                : "If you requested a taxi but do not see your ticket, tap below — do not request another ride yet."}
            </p>
            <button
              type="button"
              className="mt-2 rounded-full bg-[#1B4332] px-4 py-2 text-sm font-medium text-white"
              onClick={recoverActiveTrip}
            >
              {lang === "es" ? "Buscar mi viaje activo" : "Find my active trip"}
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
                className="underline"
                onClick={clearStaleRideUi}
              >
                {t.clearRideScreen}
              </button>
            </p>
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
              className="mt-2 underline text-[#1B4332]"
              onClick={clearStaleRideUi}
            >
              {t.clearRideScreen}
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
