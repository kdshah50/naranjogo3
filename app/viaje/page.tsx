"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
};

const COLONIAS_LIST = COLONIA_KEYS.map((key) => ({
  value: key,
  label: COLONIAS[key].label,
}));

const RIDE_STATUS_RANK: Record<string, number> = {
  requested: 0,
  matched: 1,
  accepted: 2,
  arrived: 3,
  in_trip: 4,
  completed: 5,
  cancelled: -1,
};

const VIAJE_PINNED_RIDE_KEY = "ng_viaje_pinned_ride_id";

const BUYER_ACTIVE_STATUSES = new Set([
  "requested",
  "matched",
  "accepted",
  "arrived",
  "in_trip",
]);

function isBuyerActiveStatus(status: string): boolean {
  return BUYER_ACTIVE_STATUSES.has(status);
}

function rideRank(status: string): number {
  return RIDE_STATUS_RANK[status] ?? 0;
}

function pinRideId(rideId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(VIAJE_PINNED_RIDE_KEY, rideId);
}

function clearPinnedRideId() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(VIAJE_PINNED_RIDE_KEY);
}

function mergeRideRow(prev: RideRow | null, next: RideRow | null): RideRow | null {
  if (!next) return prev;
  if (!prev) return next;
  if (prev.id !== next.id) {
    const prevActive = isBuyerActiveStatus(prev.status);
    const nextActive = isBuyerActiveStatus(next.status);
    if (nextActive && !prevActive) return next;
    if (prevActive && !nextActive) return prev;
    return rideRank(next.status) >= rideRank(prev.status) ? next : prev;
  }
  return rideRank(next.status) >= rideRank(prev.status) ? { ...prev, ...next } : prev;
}

function applyRideUpdate(prev: RideRow | null, next: RideRow | null): RideRow | null {
  const merged = mergeRideRow(prev, next);
  if (!merged) return prev;
  if (prev && rideRank(merged.status) < rideRank(prev.status)) return prev;
  return merged;
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
  const searchParams = useSearchParams();
  const rideIdFromUrl = searchParams.get("ride")?.trim() || null;
  const rideIdRef = useRef<string | null>(null);

  const [pickupColonia, setPickupColonia] = useState("centro");
  const [dropoffColonia, setDropoffColonia] = useState("guadalupe");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [passengers, setPassengers] = useState(1);

  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [ride, setRide] = useState<RideRow | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [tipMxn, setTipMxn] = useState(20);

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const pinned =
      rideIdFromUrl ??
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(VIAJE_PINNED_RIDE_KEY)
        : null);
    rideIdRef.current = ride?.id ?? pinned;
  }, [ride?.id, rideIdFromUrl]);

  const refreshActiveRide = useCallback(async () => {
    const r = await fetch("/api/rides/active", { credentials: "include", cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json().catch(() => ({}));

    const activeList = (
      Array.isArray(data.as_buyer) ? (data.as_buyer as RideRow[]) : []
    ).filter((row) => row?.id && isBuyerActiveStatus(row.status));

    if (activeList.length > 0) {
      const best = activeList[0];
      pinRideId(best.id);
      rideIdRef.current = best.id;
      setRide((prev) => applyRideUpdate(prev, best) ?? best);
      return;
    }

    const display = data.as_buyer_display as RideRow | undefined;
    if (display?.id && isBuyerActiveStatus(display.status)) {
      pinRideId(display.id);
      rideIdRef.current = display.id;
      setRide((prev) => applyRideUpdate(prev, display) ?? display);
      return;
    }

    if (display?.id) {
      setRide(display);
      return;
    }

    const urlId = rideIdFromUrl?.trim();
    if (urlId) {
      const dr = await fetch(`/api/rides/${urlId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (dr.ok) {
        const row = ((await dr.json().catch(() => ({}))) as { ride?: RideRow }).ride;
        if (row?.id) {
          setRide(row);
          return;
        }
      }
    }

    setRide(null);
  }, [rideIdFromUrl]);

  const liveRideId =
    ride?.id && isBuyerActiveStatus(ride.status) ? ride.id : rideIdFromUrl?.trim() || null;

  const liveStreamEnabled = !authError && Boolean(liveRideId);

  useRideLiveStream({
    streamUrl: liveRideId ? `/api/rides/${liveRideId}/stream` : null,
    enabled: liveStreamEnabled,
    onEvent: (payload) => {
      const row = (payload as { ride?: RideRow }).ride;
      if (!row?.id) return;
      setRide((prev) => {
        const next = applyRideUpdate(prev, row);
        if (next?.id && isBuyerActiveStatus(next.status)) pinRideId(next.id);
        return next;
      });
    },
    fallbackPollMs: 15_000,
    onFallbackPoll: refreshActiveRide,
  });

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.user?.id) setAuthError(t.loginRequired);
        else refreshActiveRide();
      })
      .catch(() => setAuthError(t.sessionError));
  }, [refreshActiveRide, t.loginRequired, t.sessionError]);

  useEffect(() => {
    if (authError) return;
    const terminal = ride?.status === "completed" || ride?.status === "cancelled";
    const ms = terminal ? 8_000 : liveStreamEnabled ? 15_000 : 3_000;
    const timer = setInterval(refreshActiveRide, ms);
    return () => clearInterval(timer);
  }, [authError, liveStreamEnabled, ride?.status, refreshActiveRide]);

  useEffect(() => {
    const onFocus = () => refreshActiveRide();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
        pinRideId(rideRow.id);
        rideIdRef.current = rideRow.id;
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("ride", rideRow.id);
          window.history.replaceState(null, "", url.toString());
        }
      }
      setRide(rideRow);
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
      setRide(data.ride ?? null);
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
      setRide(data.ride ?? null);
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

        {ride && ride.status !== "cancelled" && (
          <section className="mt-6 rounded-2xl border-2 border-[#1B4332]/20 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-lg">{rideSectionTitle}</h2>
            <p className="mt-2 text-sm">
              {t.status} <strong>{rideStatusLabel(ride.status, lang)}</strong>
            </p>
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
            {["requested", "matched", "accepted", "arrived", "in_trip"].includes(ride.status) && (
              <p className="mt-2 text-xs text-[#1B4332]/50">{t.rideSyncHint}</p>
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
