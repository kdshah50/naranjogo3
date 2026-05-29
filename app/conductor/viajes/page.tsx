"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
import {
  mergeRideStatusRow,
  rideStatusRank,
} from "@/lib/rides/ride-status-merge";
import {
  driverFlowStepIndex,
  driverFlowSteps,
  driverTripActionHint,
  driverTripsCopy,
  rideStatusLabel,
} from "@/lib/rides/ui-copy";

const DRIVER_ACTIVE_STATUSES = new Set(["matched", "accepted", "arrived", "in_trip"]);
const DRIVER_FINISHED_RIDES_KEY = "ng_driver_finished_ride_ids";
const DRIVER_FINISHED_TICKETS_KEY = "ng_driver_finished_tickets";

function isDriverActiveTrip(row: RideRow): boolean {
  return DRIVER_ACTIVE_STATUSES.has(row.status);
}

function readFinishedRideIds(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DRIVER_FINISHED_RIDES_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids.filter(Boolean));
  } catch {
    return new Set();
  }
}

function readFinishedTickets(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DRIVER_FINISHED_TICKETS_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids.filter(Boolean).map((t) => t.trim().toUpperCase()));
  } catch {
    return new Set();
  }
}

function persistFinishedSets(rideIds: Set<string>, tickets: Set<string>) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(DRIVER_FINISHED_RIDES_KEY, JSON.stringify([...rideIds]));
  sessionStorage.setItem(DRIVER_FINISHED_TICKETS_KEY, JSON.stringify([...tickets]));
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

type FinishedRideFilter = {
  rideIds: ReadonlySet<string>;
  tickets: ReadonlySet<string>;
};

function normalizeTicketCode(ticket: string | null | undefined): string {
  return (ticket ?? "").trim().toUpperCase();
}

function isFinishedDriverTrip(
  row: Pick<RideRow, "id" | "ticket_code">,
  finished: FinishedRideFilter,
  hideTickets?: ReadonlySet<string>,
): boolean {
  if (finished.rideIds.has(row.id)) return true;
  const ticket = normalizeTicketCode(row.ticket_code);
  if (!ticket) return false;
  if (finished.tickets.has(ticket)) return true;
  return Boolean(hideTickets?.has(ticket));
}

function filterOpenDriverTrips(
  rows: RideRow[],
  finished: FinishedRideFilter,
  hideTickets?: ReadonlySet<string>,
): RideRow[] {
  return rows.filter(
    (row) =>
      isDriverActiveTrip(row) &&
      !isFinishedDriverTrip(row, finished, hideTickets),
  );
}

/** GET /api/rides/[id] is source of truth — drop completed/cancelled rows the panel may cache. */
async function reconcileDriverTripsWithServer(
  candidates: RideRow[],
  finished: FinishedRideFilter,
  onTerminal: (rideId: string, ticketCode?: string | null) => void,
  hideTickets?: ReadonlySet<string>,
): Promise<RideRow[]> {
  const deduped = sortDriverTrips(filterOpenDriverTrips(candidates, finished, hideTickets));
  if (deduped.length === 0) return [];

  const results = await Promise.all(
    deduped.map(async (trip) => {
      const row = await fetchDriverRideRow(trip.id);
      if (!row || !isDriverActiveTrip(row)) {
        if (row) onTerminal(row.id, row.ticket_code);
        return null;
      }
      if (isFinishedDriverTrip(row, finished, hideTickets)) {
        onTerminal(row.id, row.ticket_code);
        return null;
      }
      return mergeRideStatusRow(trip, row);
    }),
  );
  return sortDriverTrips(results.filter((row): row is RideRow => row !== null));
}

async function fetchDriverRideRow(rideId: string): Promise<RideRow | null> {
  const r = await fetch(`/api/rides/${rideId}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!r.ok) return null;
  const data = (await r.json().catch(() => ({}))) as { ride?: RideRow };
  return data.ride?.id ? data.ride : null;
}

type RideRow = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
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

function ConductorViajesInner() {
  const lang = useAppLang();
  const t = driverTripsCopy(lang);

  const [online, setOnline] = useState<DriverOnline | null>(null);
  const [trips, setTrips] = useState<RideRow[]>([]);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ticketByRide, setTicketByRide] = useState<Record<string, string>>({});
  const [canonicalUserId, setCanonicalUserId] = useState<string | null>(null);
  const [tripDebugHint, setTripDebugHint] = useState<string | null>(null);
  const tripsRef = useRef<RideRow[]>([]);
  /** After Conectar succeeds, ignore stale panel polls that still say offline. */
  const onlineLatchUntilRef = useRef(0);
  const finishedRideIdsRef = useRef<Set<string>>(readFinishedRideIds());
  const finishedTicketsRef = useRef<Set<string>>(readFinishedTickets());
  const hideTicketsRef = useRef<Set<string>>(new Set());

  const finishedFilter = useCallback(
    (): FinishedRideFilter => ({
      rideIds: finishedRideIdsRef.current,
      tickets: finishedTicketsRef.current,
    }),
    [],
  );

  const syncHideTickets = useCallback((codes: string[] | undefined) => {
    hideTicketsRef.current = new Set((codes ?? []).map(normalizeTicketCode).filter(Boolean));
  }, []);

  const markDriverTripFinished = useCallback((rideId: string, ticketCode?: string | null) => {
    finishedRideIdsRef.current.add(rideId);
    const ticket = normalizeTicketCode(ticketCode);
    if (ticket) {
      finishedTicketsRef.current.add(ticket);
      hideTicketsRef.current.add(ticket);
    }
    persistFinishedSets(finishedRideIdsRef.current, finishedTicketsRef.current);
  }, []);

  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const mergeDriverOnline = useCallback((incoming: DriverOnline | null | undefined): DriverOnline | null => {
    if (!incoming) return null;
    if (onlineLatchUntilRef.current > Date.now() && incoming.is_online === false) {
      return { ...incoming, is_online: true };
    }
    return incoming;
  }, []);

  /** Panel API is source of truth; never merge stale client rows when server lists zero trips. */
  const applyPanelTrips = useCallback(
    async (panelTrips: RideRow[], hideTicketsFromServer?: string[]) => {
      if (hideTicketsFromServer) syncHideTickets(hideTicketsFromServer);
      const finished = finishedFilter();
      const hideTickets = hideTicketsRef.current;
      const openPanel = filterOpenDriverTrips(panelTrips, finished, hideTickets);

      if (openPanel.length > 0) {
        const reconciled = await reconcileDriverTripsWithServer(
          openPanel,
          finished,
          markDriverTripFinished,
          hideTickets,
        );
        setTrips(reconciled);
        if (reconciled.length > 0) setTripDebugHint(null);
        return;
      }

      setTrips([]);
      const staleActive = filterOpenDriverTrips(tripsRef.current, finished, hideTickets);
      if (staleActive.length === 0) return;

      const reconciled = await reconcileDriverTripsWithServer(
        staleActive,
        finished,
        markDriverTripFinished,
        hideTickets,
      );
      setTrips(reconciled);
    },
    [finishedFilter, markDriverTripFinished, syncHideTickets],
  );

  const load = useCallback(async () => {
    const r = await fetch("/api/rides/drivers/me/panel", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setPanelError(
        r.status === 404
          ? t.ridesDisabled
          : data?.error ?? t.panelLoadFailed,
      );
      return;
    }

    if (data.driver) setOnline(mergeDriverOnline(data.driver as DriverOnline));
    const panelTrips = Array.isArray(data.trips) ? (data.trips as RideRow[]) : [];
    const hideTickets = Array.isArray(data.hide_tickets)
      ? (data.hide_tickets as string[])
      : undefined;
    await applyPanelTrips(panelTrips, hideTickets);
    const sessionId = data.session_user_id ?? null;
    setCanonicalUserId(data.canonical_user_id ?? data.driver?.user_id ?? null);
    if (!data.driver?.is_active_driver && data.driver !== null) {
      setPanelError(t.inactiveDriverShort);
    } else if (!data.driver && !data.canonical_user_id) {
      const phoneHint = data.auth_phone_set ? "" : ` ${t.sessionMissingPhone}`;
      const sessionHint = sessionId
        ? ` ${t.sessionIdLabel} ${String(sessionId).slice(0, 8)}…`
        : "";
      setPanelError(t.noDriverProfile + phoneHint + sessionHint);
    } else {
      setPanelError(null);
    }
  }, [
    applyPanelTrips,
    mergeDriverOnline,
    t.panelLoadFailed,
    t.inactiveDriverShort,
    t.noDriverProfile,
    t.ridesDisabled,
    t.sessionMissingPhone,
    t.sessionIdLabel,
  ]);

  const displayError = actionError ?? panelError;

  const isOnline = Boolean(online?.is_online);
  const canGoOnline = Boolean(online?.is_active_driver);

  const panelStreamEnabled = !panelError && Boolean(canonicalUserId ?? online?.user_id);

  useRideLiveStream({
    streamUrl: panelStreamEnabled ? "/api/rides/drivers/me/stream" : null,
    enabled: panelStreamEnabled,
    onEvent: (payload) => {
      const data = payload as {
        driver?: DriverOnline | null;
        trips?: RideRow[];
        canonical_user_id?: string | null;
      };
      if (data.driver) setOnline(mergeDriverOnline(data.driver));
      if (Array.isArray(data.trips)) {
        void applyPanelTrips(
          data.trips as RideRow[],
          Array.isArray(data.hide_tickets) ? (data.hide_tickets as string[]) : undefined,
        );
      }
      if (data.canonical_user_id) setCanonicalUserId(data.canonical_user_id);
    },
    fallbackPollMs: 30_000,
    onFallbackPoll: load,
  });

  useEffect(() => {
    load();
    const ms = panelStreamEnabled ? (isOnline ? 15_000 : 20_000) : isOnline ? 3000 : 8000;
    const timer = setInterval(load, ms);
    return () => clearInterval(timer);
  }, [load, isOnline, panelStreamEnabled]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  useEffect(() => {
    if (trips.length > 0) {
      setTripDebugHint(null);
    }
  }, [trips.length]);

  const refreshOnlineStatus = useCallback(async () => {
    const r = await fetch("/api/rides/drivers/me/online", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (data.driver) setOnline(mergeDriverOnline(data.driver as DriverOnline));
    return data.driver as DriverOnline | undefined;
  }, [mergeDriverOnline]);

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
        if (next) onlineLatchUntilRef.current = Date.now() + 90_000;
        else onlineLatchUntilRef.current = 0;
        setOnline(mergeDriverOnline({ ...driver, is_online: next }));
      }
      await load();

      if (!next) return;

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGpsNotice(t.gpsDenied);
        await refreshOnlineStatus();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const gps = await fetch("/api/rides/drivers/me/online", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              online: true,
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
          await load();
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

  const mergeTripFromApi = (rideId: string, row: RideRow | undefined) => {
    if (!row?.id) return;
    if (!isDriverActiveTrip(row)) {
      markDriverTripFinished(rideId, row.ticket_code);
    }
    const finished = finishedFilter();
    const hideTickets = hideTicketsRef.current;
    setTrips((prev) => {
      if (!isDriverActiveTrip(row) || isFinishedDriverTrip(row, finished, hideTickets)) {
        return filterOpenDriverTrips(
          prev.filter((t) => t.id !== rideId),
          finished,
          hideTickets,
        );
      }
      const idx = prev.findIndex((t) => t.id === rideId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = mergeRideStatusRow(next[idx], row);
        return sortDriverTrips(filterOpenDriverTrips(next, finished, hideTickets));
      }
      return sortDriverTrips(filterOpenDriverTrips([row, ...prev], finished, hideTickets));
    });
  };

  const action = async (rideId: string, path: string, body?: Record<string, unknown>) => {
    setBusy(rideId + path);
    setActionError(null);
    setActionSuccess(null);
    try {
      const r = await fetch(`/api/rides/${rideId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setActionError(data?.error ?? t.actionFailed);
        return;
      }
      const row = data.ride as RideRow | undefined;
      mergeTripFromApi(rideId, row);
      if (path === "complete") {
        markDriverTripFinished(rideId, row?.ticket_code);
        setActionSuccess(t.completeSuccess);
        setTrips((prev) =>
          filterOpenDriverTrips(
            prev.filter(
              (t) =>
                t.id !== rideId &&
                (!row?.ticket_code ||
                  normalizeTicketCode(t.ticket_code) !== normalizeTicketCode(row.ticket_code)),
            ),
            finishedFilter(),
            hideTicketsRef.current,
          ),
        );
      } else {
        if (path === "accept") setActionSuccess(t.acceptSuccess);
        else if (path === "arrive") setActionSuccess(t.arriveSuccess);
        else if (path === "start") setActionSuccess(t.startSuccess);
        void fetchDriverRideRow(rideId).then((fresh) => {
          if (fresh) mergeTripFromApi(rideId, fresh);
        });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F4ED] text-[#1B4332]">
      <div className="mx-auto max-w-lg px-4 py-8">
        <RidesStagingBanner />

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="mt-1 text-sm text-[#1B4332]/70">{t.subtitle}</p>
          </div>
          <Link href={withLang("/conductor", lang)} className="text-sm font-medium underline">
            {t.profile}
          </Link>
        </div>

        {!online?.is_active_driver && online !== null && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            {t.inactiveDriverPrefix}
            <Link href={withLang("/conductor", lang)} className="underline">
              /conductor
            </Link>
            {t.inactiveDriverSuffix}
          </div>
        )}

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
          {!canGoOnline && (
            <p className="mt-3 text-xs text-amber-800 leading-relaxed">{t.connectBlockedHint}</p>
          )}
        </section>

        {isOnline && (
          <section className="mb-6 rounded-2xl border border-[#1B4332]/15 bg-white/80 p-4 text-sm">
            <p className="font-medium">{t.flowGuideTitle}</p>
            <p className="mt-1 text-xs text-[#1B4332]/60 leading-relaxed">{t.flowWhereHint}</p>
            <ol className="mt-3 space-y-2">
              {driverFlowSteps(lang).map((step, i) => {
                const activeIdx =
                  trips.length > 0
                    ? Math.max(...trips.map((tr) => driverFlowStepIndex(tr.status)))
                    : -1;
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

        {gpsNotice && (
          <div
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            {gpsNotice}
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

        {trips.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-[#1B4332]/70">{t.noActiveTrips}</p>
            {isOnline && (
              <div className="space-y-2">
                <p className="text-xs text-[#1B4332]/50 leading-relaxed">
                  {t.staleTripHint}
                  {canonicalUserId && (
                    <>
                      {" "}
                      {t.driverIdLabel}{" "}
                      <span className="font-mono">{canonicalUserId.slice(0, 8)}…</span>
                    </>
                  )}
                </p>
                {tripDebugHint && (
                  <p className="text-xs text-amber-800 leading-relaxed rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    {tripDebugHint}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-4">
            {trips.map((trip) => {
              const stepIdx = driverFlowStepIndex(trip.status);
              const currentStep =
                stepIdx >= 0 ? driverFlowSteps(lang)[stepIdx] : null;
              return (
              <li key={trip.id} className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
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
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
