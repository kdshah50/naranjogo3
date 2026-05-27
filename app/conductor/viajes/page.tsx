"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
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

/** Never downgrade status when panel poll/SSE returns stale rows (same rule as /viaje). */
function mergeDriverTripLists(prev: RideRow[], next: RideRow[]): RideRow[] {
  const activePrev = prev.filter(isDriverActiveTrip);
  const activeNext = next.filter(isDriverActiveTrip);
  // Server returned no active trips (e.g. after complete) — clear stale cards; do not keep old prev.
  if (activeNext.length === 0) return [];
  return sortDriverTrips(mergeRideListsByStatus(activePrev, activeNext));
}

function debugRideToRow(
  r: {
    id: string;
    status: string;
    ticket_code: string | null;
    pickup_address: string;
    dropoff_address: string;
  },
): RideRow {
  return {
    id: r.id,
    status: r.status,
    pickup_address: r.pickup_address,
    dropoff_address: r.dropoff_address,
    ticket_code: r.ticket_code,
    estimated_total_mxn_cents: 0,
  };
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

    if (data.driver) setOnline(data.driver as DriverOnline);
    const nextTrips = sortDriverTrips(
      (Array.isArray(data.trips) ? (data.trips as RideRow[]) : []).filter(isDriverActiveTrip),
    );
    setTrips((prev) => {
      if (nextTrips.length === 0) return [];
      if (prev.length === 0) return nextTrips;
      return mergeDriverTripLists(prev, nextTrips);
    });
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
      if (data.driver) setOnline(data.driver);
      if (Array.isArray(data.trips)) {
        const incoming = sortDriverTrips(data.trips.filter(isDriverActiveTrip));
        setTrips((prev) => {
          if (incoming.length === 0) return [];
          if (prev.length === 0) return incoming;
          return mergeDriverTripLists(prev, incoming);
        });
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
    if (!isOnline || trips.length > 0) {
      setTripDebugHint(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/rides-drivers-trips-debug", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await r.json().catch(() => ({}));
      if (cancelled || !r.ok) return;

      const profileId = (data.profile_user_id as string | null)?.toLowerCase();
      const dbRides = (data.db_active_rides ?? []) as Array<{
        id: string;
        status: string;
        ticket_code: string | null;
        driver_id: string;
        pickup_address: string;
        dropoff_address: string;
      }>;

      const mine = profileId
        ? dbRides.filter((row) => row.driver_id?.toLowerCase() === profileId)
        : [];
      if (mine.length > 0) {
        const recovered = sortDriverTrips(
          mine.filter((r) => DRIVER_ACTIVE_STATUSES.has(r.status)).map(debugRideToRow),
        );
        if (recovered.length > 0) {
          setTrips((prev) => mergeDriverTripLists(prev, recovered));
          setTripDebugHint(t.tripRecoveredHint);
        }
      }

      const checks = Array.isArray(data.checks) ? (data.checks as string[]).join(" ") : "";
      const ticket = dbRides[0]?.ticket_code;
      if (checks) {
        setTripDebugHint(
          ticket ? `${t.tripAssignedHint} ${ticket}). ${checks}` : checks,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, trips.length, t.tripAssignedHint, t.tripRecoveredHint]);

  const refreshOnlineStatus = useCallback(async () => {
    const r = await fetch("/api/rides/drivers/me/online", {
      credentials: "include",
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (data.driver) setOnline(data.driver as DriverOnline);
    return data.driver as DriverOnline | undefined;
  }, []);

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
        setOnline({ ...driver, is_online: next });
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
          if (gpsData.driver) setOnline(gpsData.driver as DriverOnline);
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
    setTrips((prev) => {
      if (!isDriverActiveTrip(row)) {
        return prev.filter((t) => t.id !== rideId);
      }
      const idx = prev.findIndex((t) => t.id === rideId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = mergeRideStatusRow(next[idx], row);
        return sortDriverTrips(next);
      }
      return sortDriverTrips([row, ...prev]);
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
        setActionSuccess(t.completeSuccess);
        setTrips((prev) =>
          prev.filter(
            (t) =>
              t.id !== rideId &&
              (!row?.ticket_code || t.ticket_code !== row.ticket_code),
          ),
        );
      } else if (path === "accept") setActionSuccess(t.acceptSuccess);
      else if (path === "arrive") setActionSuccess(t.arriveSuccess);
      else if (path === "start") setActionSuccess(t.startSuccess);
      // Do not load() here — poll/SSE merge must not resurrect completed trips (see mergeDriverTripLists).
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
