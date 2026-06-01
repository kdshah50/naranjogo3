"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
import { fetchRideRowById } from "@/lib/rides/client-ride-sync";
import {
  mergeRideListsByStatus,
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
  const [syncDebug, setSyncDebug] = useState<SyncDebug | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ticketByRide, setTicketByRide] = useState<Record<string, string>>({});
  const [canonicalUserId, setCanonicalUserId] = useState<string | null>(null);

  /** After Conectar succeeds, ignore stale panel polls that still say offline. */
  const onlineLatchUntilRef = useRef(0);

  /** Apply trip row from POST /accept|arrive|start|complete — panel poll can lag behind DB. */
  const upsertTripFromAction = useCallback((incoming: RideRow) => {
    if (!incoming?.id || !isDriverActiveTrip(incoming)) return;
    setTrips((prev) => {
      const existing = prev.find((t) => t.id === incoming.id);
      const row = existing ? mergeRideStatusRow(existing, incoming) : incoming;
      const rest = prev.filter((t) => t.id !== incoming.id);
      return activeTripsFromPanel([...rest, row]);
    });
  }, []);

  /** Authoritative row by id — list/panel endpoints can lag behind POST. */
  const refreshTripById = useCallback(
    async (rideId: string) => {
      const row = await fetchRideRowById<RideRow>(rideId);
      if (!row) return;
      if (isDriverActiveTrip(row)) upsertTripFromAction(row);
      else setTrips((prev) => prev.filter((t) => t.id !== rideId));
    },
    [upsertTripFromAction],
  );

  const applyServerTrips = useCallback((raw: RideRow[], source: string) => {
    const next = activeTripsFromPanel(raw);
    let merged = next;
    setTrips((prev) => {
      merged = activeTripsFromPanel(mergeRideListsByStatus(prev, next));
      return merged;
    });
    const apiSummary =
      merged.length === 0
        ? "0 trips"
        : `${merged.length} trip · ${merged[0].status}${merged[0].ticket_code ? ` · ${merged[0].ticket_code}` : ""}`;
    setSyncDebug({
      source,
      at: new Date().toLocaleTimeString(),
      apiCount: next.length,
      apiSummary,
      uiCount: merged.length,
      mismatch: merged.length !== next.length,
    });
    return next;
  }, []);

  const mergeDriverOnline = useCallback((incoming: DriverOnline | null | undefined): DriverOnline | null => {
    if (!incoming) return null;
    if (onlineLatchUntilRef.current > Date.now() && incoming.is_online === false) {
      return { ...incoming, is_online: true };
    }
    return incoming;
  }, []);

  const load = useCallback(async (source = "poll") => {
    const r = await fetch(`/api/rides/drivers/me/panel?_=${Date.now()}`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setPanelError(
        r.status === 404 ? t.ridesDisabled : data?.error ?? t.panelLoadFailed,
      );
      return;
    }

    if (data.driver) setOnline(mergeDriverOnline(data.driver as DriverOnline));
    const panelTrips = Array.isArray(data.trips) ? (data.trips as RideRow[]) : [];
    applyServerTrips(panelTrips, source);

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
    applyServerTrips,
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
      if (Array.isArray(data.trips)) applyServerTrips(data.trips, "SSE");
      if (data.canonical_user_id) setCanonicalUserId(data.canonical_user_id);
    },
    fallbackPollMs: 12_000,
    onFallbackPoll: () => void load("poll-backup"),
  });

  useEffect(() => {
    void load("mount");
    const ms = trips.length > 0 ? 3_000 : isOnline ? 5_000 : 8_000;
    const timer = setInterval(() => void load("poll"), ms);
    return () => clearInterval(timer);
  }, [load, isOnline, trips.length]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load("pageshow");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

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
      await load("online-toggle");

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

      const rideFromAction = data.ride as RideRow | undefined;
      if (rideFromAction?.id) upsertTripFromAction(rideFromAction);

      await refreshTripById(rideId);

      if (path === "complete") setActionSuccess(t.completeSuccess);
      else if (path === "accept") setActionSuccess(t.acceptSuccess);
      else if (path === "arrive") setActionSuccess(t.arriveSuccess);
      else if (path === "start") setActionSuccess(t.startSuccess);
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
            {isOnline && canonicalUserId && (
              <p className="text-xs text-[#1B4332]/50 leading-relaxed">
                {t.staleTripHint}{" "}
                {t.driverIdLabel}{" "}
                <span className="font-mono">{canonicalUserId.slice(0, 8)}…</span>
              </p>
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
