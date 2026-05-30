"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { RidesStagingBanner } from "@/components/RidesStagingBanner";
import { useAppLang } from "@/hooks/use-app-lang";
import { COLONIA_KEYS, COLONIAS, coloniaLabel } from "@/lib/colonias";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { useRideLiveStream } from "@/hooks/use-ride-live-stream";
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

function pinRideId(rideId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VIAJE_PINNED_RIDE_KEY, rideId);
}

function clearPinnedRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VIAJE_PINNED_RIDE_KEY);
}

function stripRideIdFromBrowserUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ride")) return;
  url.searchParams.delete("ride");
  window.history.replaceState(null, "", url.toString());
}

async function fetchBuyerRideRow(rideId: string): Promise<RideRow | null> {
  const r = await fetch(`/api/rides/${rideId}?_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!r.ok) return null;
  const data = (await r.json().catch(() => ({}))) as { ride?: RideRow };
  return data.ride?.id ? data.ride : null;
}

type SyncDebug = {
  source: string;
  at: string;
  apiSummary: string;
  uiStatus: string;
  uiTicket: string;
  mismatch: boolean;
};

function formatRiderSyncDebug(d: SyncDebug): string {
  const flag = d.mismatch ? " · UI MISMATCH" : "";
  return `Active API: ${d.apiSummary} · UI: ${d.uiStatus}${d.uiTicket ? ` · ${d.uiTicket}` : ""}${flag} · ${d.source} ${d.at}`;
}

function syncDebugForRow(row: RideRow | null, source: string, note?: string): SyncDebug {
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
  };
}

/** List payload can lag — only treat ride as open when GET /api/rides/:id confirms active status. */
async function resolveOpenBuyerRide(candidate: RideRow | undefined): Promise<RideRow | null> {
  if (!candidate?.id || !isBuyerActiveStatus(candidate.status)) return null;
  const truth = await fetchBuyerRideRow(candidate.id);
  const row = truth ?? candidate;
  return isBuyerActiveStatus(row.status) ? row : null;
}

async function fetchOpenPinnedRide(rideId: string): Promise<RideRow | null> {
  const truth = await fetchBuyerRideRow(rideId);
  return truth && isBuyerActiveStatus(truth.status) ? truth : null;
}

function readPinnedRideId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const id = sessionStorage.getItem(VIAJE_PINNED_RIDE_KEY)?.trim();
  return id || null;
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
  const requestLatchUntilRef = useRef(0);
  const refreshSeqRef = useRef(0);

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
  const [syncDebug, setSyncDebug] = useState<SyncDebug | null>(null);

  const applyServerRide = useCallback((row: RideRow | null, source: string, note?: string) => {
    if (row && isTerminalRideStatus(row.status) && POLL_SOURCES.has(source)) {
      row = null;
    }

    if (row && isBuyerActiveStatus(row.status)) {
      setRide(row);
      setTerminalBanner(null);
      pinRideId(row.id);
      rideIdRef.current = row.id;
      setSyncDebug(syncDebugForRow(row, source, note));
      return;
    }

    if (row && isTerminalRideStatus(row.status)) {
      setRide(null);
      if (!POLL_SOURCES.has(source)) setTerminalBanner(row);
      clearPinnedRideId();
      stripRideIdFromBrowserUrl();
      rideIdRef.current = null;
      setSyncDebug(
        syncDebugForRow(
          null,
          source,
          POLL_SOURCES.has(source)
            ? `0 open (GET verified ${row.status}${row.ticket_code ? ` · ${row.ticket_code}` : ""})`
            : undefined,
        ),
      );
      return;
    }

    setRide(null);
    if (POLL_SOURCES.has(source)) setTerminalBanner(null);
    clearPinnedRideId();
    stripRideIdFromBrowserUrl();
    rideIdRef.current = null;
    setSyncDebug(syncDebugForRow(null, source, note));
  }, []);

  const clearStaleRideUi = useCallback(() => {
    clearPinnedRideId();
    stripRideIdFromBrowserUrl();
    rideIdRef.current = null;
    setRide(null);
    setTerminalBanner(null);
    setSyncDebug(syncDebugForRow(null, "clear"));
  }, []);

  /** Server wins: open trips only on poll — ignore stale as_buyer_display completed rows. */
  const refreshActiveRide = useCallback(async (source = "poll") => {
    const seq = ++refreshSeqRef.current;
    const isStale = () => seq !== refreshSeqRef.current;

    const pinnedId = rideIdRef.current ?? readPinnedRideId();
    const reconcileQs = pinnedId
      ? `&reconcile_ride_id=${encodeURIComponent(pinnedId)}`
      : "";

    const r = await fetch(`/api/rides/active?_=${Date.now()}${reconcileQs}`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    if (isStale()) return;

    if (!r.ok) {
      const trackedId = rideIdRef.current ?? pinnedId;
      if (trackedId) {
        const pinnedOpen = await fetchOpenPinnedRide(trackedId);
        if (pinnedOpen && !isStale()) {
          applyServerRide(pinnedOpen, source, "pinned (active API error)");
          return;
        }
      }
      if (!isStale()) clearStaleRideUi();
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (isStale()) return;

    const debugMeta = data.debug as
      | { user_id?: string; pool_size?: number; raw_buyer_count?: number }
      | undefined;
    const debugSuffix = debugMeta
      ? ` · uid ${debugMeta.user_id ?? "?"} · pool ${debugMeta.pool_size ?? "?"} · raw ${debugMeta.raw_buyer_count ?? "?"}`
      : "";

    const active = data.as_buyer_active as RideRow | null | undefined;
    const openFromActive = await resolveOpenBuyerRide(active ?? undefined);
    if (openFromActive && !isStale()) {
      applyServerRide(openFromActive, source);
      return;
    }

    const activeList = Array.isArray(data.as_buyer) ? (data.as_buyer as RideRow[]) : [];
    for (const candidate of activeList) {
      const open = await resolveOpenBuyerRide(candidate);
      if (open && !isStale()) {
        applyServerRide(open, source);
        return;
      }
    }

    const reconciled = data.reconciled_ride as RideRow | undefined;
    const openFromReconcile = await resolveOpenBuyerRide(reconciled);
    if (openFromReconcile && !isStale()) {
      applyServerRide(openFromReconcile, source, "reconciled");
      return;
    }

    const trackedId = rideIdRef.current ?? readPinnedRideId();
    if (trackedId) {
      const pinnedOpen = await fetchOpenPinnedRide(trackedId);
      if (pinnedOpen && !isStale()) {
        applyServerRide(pinnedOpen, source, "pinned GET");
        return;
      }
    }

    if (!isStale() && Date.now() < requestLatchUntilRef.current && trackedId) {
      return;
    }

    const display = data.as_buyer_display as RideRow | undefined;
    const ignoredNote =
      display?.id && !isBuyerActiveStatus(display.status)
        ? `0 open (skipped last ${display.status}${display.ticket_code ? ` · ${display.ticket_code}` : ""})${debugSuffix}`
        : `0 open${debugSuffix}`;

    if (!isStale()) applyServerRide(null, source, ignoredNote);
  }, [applyServerRide, clearStaleRideUi]);

  // Do not use ?ride= in the URL for SSE — it re-attaches ghost trips after refresh.
  const liveRideId =
    ride?.id && isBuyerActiveStatus(ride.status) ? ride.id : null;

  const liveStreamEnabled = !authError && Boolean(liveRideId);

  useRideLiveStream({
    streamUrl: liveRideId ? `/api/rides/${liveRideId}/stream` : null,
    enabled: liveStreamEnabled,
    onEvent: (payload) => {
      const row = (payload as { ride?: RideRow }).ride;
      if (!row?.id) return;
      applyServerRide(row, "SSE");
    },
    fallbackPollMs: 12_000,
    onFallbackPoll: () => void refreshActiveRide("poll-backup"),
  });

  useEffect(() => {
    stripRideIdFromBrowserUrl();
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.user?.id) setAuthError(t.loginRequired);
        else void refreshActiveRide("mount");
      })
      .catch(() => setAuthError(t.sessionError));
  }, [refreshActiveRide, t.loginRequired, t.sessionError]);

  useEffect(() => {
    if (authError) return;
    const terminal = ride?.status === "completed" || ride?.status === "cancelled";
    const ms = terminal ? 8_000 : 5_000;
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

  const canSubmit = useMemo(
    () => pickupColonia !== dropoffColonia && !authError,
    [pickupColonia, dropoffColonia, authError],
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
        requestLatchUntilRef.current = Date.now() + 20_000;
        refreshSeqRef.current += 1;
        pinRideId(rideRow.id);
        rideIdRef.current = rideRow.id;
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("ride", rideRow.id);
          window.history.replaceState(null, "", url.toString());
        }
      }
      applyServerRide(rideRow, "request");
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
      applyServerRide(data.ride ?? null, "cancel");
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

        {ride && isBuyerActiveStatus(ride.status) && (
          <section
            className={`mt-6 rounded-2xl border-2 bg-white p-5 shadow-sm ${
              ride.status === "cancelled"
                ? "border-red-300"
                : "border-[#1B4332]/20"
            }`}
          >
            <h2 className="font-semibold text-lg">{rideSectionTitle}</h2>
            <p className="mt-2 text-sm">
              {t.status} <strong>{rideStatusLabel(ride.status, lang)}</strong>
            </p>
            {ride.status === "cancelled" && (
              <p className="mt-2 text-sm text-red-800">{t.rideCancelledHint}</p>
            )}
            <p className="text-sm text-[#1B4332]/80">
              {ride.pickup_address} → {ride.dropoff_address}
            </p>
            {ride.ticket_code && (
              <p className="mt-3 text-lg font-mono font-bold">
                {t.ticket} {ride.ticket_code}
              </p>
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
