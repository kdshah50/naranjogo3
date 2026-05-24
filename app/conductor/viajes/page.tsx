"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { driverTripActionHint, driverTripsCopy, rideStatusLabel } from "@/lib/rides/ui-copy";

type RideRow = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  ticket_code: string | null;
  estimated_total_mxn_cents: number;
};

type DriverOnline = {
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ticketByRide, setTicketByRide] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [oRes, tRes] = await Promise.all([
      fetch("/api/rides/drivers/me/online", { credentials: "include", cache: "no-store" }),
      fetch("/api/rides/drivers/me/trips", { credentials: "include", cache: "no-store" }),
    ]);
    const oData = await oRes.json().catch(() => ({}));
    const tData = await tRes.json().catch(() => ({}));
    if (!oRes.ok && oRes.status !== 404) {
      setError(oData?.error ?? t.profileLoadFailed);
    } else {
      setOnline(oData.driver ?? null);
    }
    if (tRes.ok) setTrips(tData.trips ?? []);
  }, [t.profileLoadFailed]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const toggleOnline = async (next: boolean) => {
    setBusy("online");
    setError(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (next && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          /* GPS optional */
        }
      }
      const r = await fetch("/api/rides/drivers/me/online", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next, lat, lng }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error ?? t.toggleFailed);
        return;
      }
      setOnline(data.driver ?? null);
    } finally {
      setBusy(null);
    }
  };

  const action = async (rideId: string, path: string, body?: Record<string, unknown>) => {
    setBusy(rideId + path);
    setError(null);
    try {
      const r = await fetch(`/api/rides/${rideId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error ?? t.actionFailed);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const isOnline = Boolean(online?.is_online);

  return (
    <main className="min-h-screen bg-[#F8F4ED] text-[#1B4332]">
      <div className="mx-auto max-w-lg px-4 py-8">
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
              disabled={busy === "online"}
              onClick={() => toggleOnline(!isOnline)}
              className={`rounded-full px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                isOnline ? "bg-amber-700" : "bg-[#1B4332]"
              }`}
            >
              {busy === "online" ? "…" : isOnline ? t.disconnect : t.connect}
            </button>
          </div>
        </section>

        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {trips.length === 0 ? (
          <p className="text-sm text-[#1B4332]/70">{t.noActiveTrips}</p>
        ) : (
          <ul className="space-y-4">
            {trips.map((trip) => (
              <li key={trip.id} className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
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
                      value={ticketByRide[trip.id] ?? ""}
                      onChange={(e) =>
                        setTicketByRide((m) => ({ ...m, [trip.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() =>
                        action(trip.id, "start", { ticket_code: ticketByRide[trip.id] ?? "" })
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
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
