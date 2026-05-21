"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { COLONIA_KEYS, COLONIAS, coloniaLabel } from "@/lib/colonias";
import { formatCurrencyMXN } from "@/lib/locale-format";

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
  ticket_code: string | null;
  driver_id: string | null;
};

const COLONIAS_LIST = COLONIA_KEYS.map((key) => ({
  value: key,
  label: COLONIAS[key].label,
}));

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

  const refreshActiveRide = useCallback(async () => {
    const r = await fetch("/api/rides/active", { credentials: "include", cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json().catch(() => ({}));
    const active = (data.as_buyer?.[0] as RideRow | undefined) ?? null;
    if (active) setRide(active);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.user?.id) setAuthError("Inicia sesión para pedir un viaje.");
        else refreshActiveRide();
      })
      .catch(() => setAuthError("No se pudo verificar la sesión."));
  }, [refreshActiveRide]);

  useEffect(() => {
    if (!ride || ride.status === "completed" || ride.status === "cancelled") return;
    const t = setInterval(refreshActiveRide, 6000);
    return () => clearInterval(t);
  }, [ride, refreshActiveRide]);

  const canSubmit = useMemo(
    () => pickupColonia !== dropoffColonia && !authError,
    [pickupColonia, dropoffColonia, authError]
  );

  const runEstimate = useCallback(async () => {
    if (pickupColonia === dropoffColonia) {
      setEstimateError("Elige colonias diferentes.");
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
        setEstimateError(data?.error ?? "No se pudo estimar");
        return;
      }
      setEstimate(data.estimate ?? null);
    } finally {
      setEstimating(false);
    }
  }, [pickupColonia, dropoffColonia, pickupAddress, dropoffAddress]);

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
        setRequestError(data?.error ?? "No se pudo solicitar el viaje");
        if (data?.code === "insufficient_balance") {
          setRequestError(
            (data?.error ?? "Saldo insuficiente") +
              " — carga saldo en /saldo antes de pedir un viaje."
          );
        }
        return;
      }
      setRide(data.ride ?? null);
      if (data.estimate) setEstimate(data.estimate);
      await refreshActiveRide();
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
        setRequestError(data?.error ?? "No se pudo cancelar");
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
        setRequestError(data?.error ?? "No se pudo enviar propina");
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
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pedir viaje</h1>
            <p className="mt-1 text-sm text-[#1B4332]/70">
              Taxi NaranjoGo — prueba Phase 2 + 3 en preview
            </p>
          </div>
          <Link href="/saldo" className="text-sm font-medium underline">
            Saldo
          </Link>
        </div>

        {authError && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            {authError}{" "}
            <Link href="/unete" className="font-medium underline">
              Entrar
            </Link>
          </div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Origen (colonia)</label>
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
              placeholder="Detalle (opcional) — ej. Plaza Cívica"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Destino (colonia)</label>
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
              placeholder="Detalle (opcional)"
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pasajeros</label>
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
              {estimating ? "Calculando…" : "Ver tarifa"}
            </button>
            <button
              type="button"
              onClick={requestRide}
              disabled={requesting || !canSubmit}
              className="rounded-full bg-[#1B4332] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {requesting ? "Solicitando…" : "Pedir taxi"}
            </button>
          </div>

          {estimateError && <p className="text-sm text-red-700">{estimateError}</p>}
          {requestError && <p className="text-sm text-red-700">{requestError}</p>}

          {estimate && (
            <div className="rounded-lg bg-[#F8F4ED] px-4 py-3 text-sm">
              <p>
                Tarifa estimada:{" "}
                <strong>{formatCurrencyMXN(estimate.estimated_total_mxn_cents, "es")}</strong>
              </p>
              <p className="text-[#1B4332]/70">
                Reserva en saldo: {formatCurrencyMXN(estimate.hold_amount_mxn_cents, "es")} · ~
                {distanceKm} km · ~{durationMin} min
                {estimate.surge_multiplier > 1 ? ` · surge ×${estimate.surge_multiplier}` : ""}
              </p>
            </div>
          )}
        </section>

        {ride && (
          <section className="mt-6 rounded-2xl border-2 border-[#1B4332]/20 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-lg">Viaje creado</h2>
            <p className="mt-2 text-sm">
              Estado: <strong>{ride.status}</strong>
            </p>
            <p className="text-sm text-[#1B4332]/80">
              {ride.pickup_address} → {ride.dropoff_address}
            </p>
            {ride.ticket_code && (
              <p className="mt-3 text-lg font-mono font-bold">Ticket: {ride.ticket_code}</p>
            )}
            {!ride.driver_id && ride.status === "requested" && (
              <p className="mt-2 text-sm text-amber-800">Buscando conductor…</p>
            )}
            {["requested", "matched", "accepted", "arrived"].includes(ride.status) && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={cancelRide}
                className="mt-3 rounded-full border border-red-700 px-4 py-2 text-sm text-red-800 disabled:opacity-50"
              >
                Cancelar viaje
              </button>
            )}
            {ride.status === "completed" && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  Propina (MXN)
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
                  Enviar propina
                </button>
              </div>
            )}
            <p className="mt-3 text-xs text-[#1B4332]/60">ID: {ride.id}</p>
          </section>
        )}

        <p className="mt-8 text-xs text-[#1B4332]/60 leading-relaxed">
          WhatsApp (Phase 2): envía &quot;taxi de centro a guadalupe&quot; al sandbox de Twilio si
          configuraste el webhook en <code>/api/rides/whatsapp/inbound</code>. Requiere saldo en{" "}
          <Link href="/saldo" className="underline">
            /saldo
          </Link>{" "}
          y un conductor aprobado en la colonia de origen.
        </p>
      </div>
    </main>
  );
}
