"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrencyMXN } from "@/lib/locale-format";

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

const STATUS_LABEL: Record<string, string> = {
  matched: "Asignado — acepta el viaje",
  accepted: "Aceptado — ve al origen",
  arrived: "En origen — pide el código",
  in_trip: "En curso",
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
      setError(oData?.error ?? "No se pudo cargar el perfil de conductor");
    } else {
      setOnline(oData.driver ?? null);
    }
    if (tRes.ok) setTrips(tData.trips ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
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
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
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
        setError(data?.error ?? "No se pudo cambiar el estado");
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
        setError(data?.error ?? "Acción fallida");
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
            <h1 className="text-2xl font-bold">Viajes asignados</h1>
            <p className="mt-1 text-sm text-[#1B4332]/70">Panel del conductor</p>
          </div>
          <Link href="/conductor" className="text-sm font-medium underline">
            Perfil
          </Link>
        </div>

        {!online?.is_active_driver && online !== null && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            Tu cuenta de conductor no está activa. Completa{" "}
            <Link href="/conductor" className="underline">
              /conductor
            </Link>{" "}
            y pide aprobación al admin.
          </div>
        )}

        <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{isOnline ? "En línea" : "Fuera de línea"}</p>
              <p className="text-sm text-[#1B4332]/70">
                {isOnline
                  ? "Recibirás viajes en tus colonias de servicio."
                  : "Actívate para aparecer en el despacho."}
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
              {busy === "online" ? "…" : isOnline ? "Desconectar" : "Conectar"}
            </button>
          </div>
        </section>

        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {trips.length === 0 ? (
          <p className="text-sm text-[#1B4332]/70">No tienes viajes activos.</p>
        ) : (
          <ul className="space-y-4">
            {trips.map((trip) => (
              <li key={trip.id} className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
                <p className="text-xs uppercase tracking-wide text-[#1B4332]/60">{trip.status}</p>
                <p className="font-medium">
                  {trip.pickup_address} → {trip.dropoff_address}
                </p>
                <p className="text-sm text-[#1B4332]/70">
                  Tarifa est.: {formatCurrencyMXN(trip.estimated_total_mxn_cents, "es")}
                </p>
                {trip.ticket_code && (
                  <p className="text-sm">
                    Código del pasajero: <span className="font-mono font-bold">{trip.ticket_code}</span>
                  </p>
                )}
                <p className="text-xs text-[#1B4332]/50">{STATUS_LABEL[trip.status] ?? ""}</p>

                {trip.status === "matched" && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => action(trip.id, "accept")}
                    className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Aceptar viaje
                  </button>
                )}
                {trip.status === "accepted" && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => action(trip.id, "arrive")}
                    className="rounded-full bg-[#1B4332] px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Llegué al origen
                  </button>
                )}
                {trip.status === "arrived" && (
                  <div className="flex flex-wrap gap-2 items-end">
                    <input
                      className="rounded-lg border border-[#1B4332]/20 px-3 py-2 text-sm font-mono"
                      placeholder="NG-XXXXXXXX"
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
                      Iniciar viaje
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
                    Completar viaje
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
