"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrencyMXN } from "@/lib/locale-format";

type Wallet = {
  user_id: string;
  balance_mxn_cents: number;
  held_mxn_cents: number;
  version: number;
  recent_ledger: Array<{
    id: string;
    kind: string;
    amount_mxn_cents: number;
    created_at: string;
  }>;
};

const PRESET_AMOUNTS_MXN = [200, 500, 1000];

export default function SaldoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8F4ED] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
        </main>
      }
    >
      <SaldoPageInner />
    </Suspense>
  );
}

function SaldoPageInner() {
  const params = useSearchParams();
  const topupResult = params.get("topup");

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyAmount, setBusyAmount] = useState<number | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rides/wallet", { credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(data?.error ?? "No se pudo cargar el saldo");
          return;
        }
        setWallet(data.wallet ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Error de red al cargar el saldo");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startTopup(amountMxn: number) {
    setBusyAmount(amountMxn);
    setTopupError(null);
    try {
      const res = await fetch("/api/rides/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount_mxn: amountMxn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setTopupError(data?.error ?? "No se pudo iniciar la carga");
        setBusyAmount(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setTopupError("Error de red al iniciar la carga");
      setBusyAmount(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F4ED] px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-[#1B4332]">Saldo Naranjo</h1>
          <p className="mt-1 text-sm text-[#5C5345]">
            Carga saldo prepagado para usar en NaranjoGo.
          </p>
        </header>

        {topupResult === "success" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Recibimos tu solicitud. Si pagas en OXXO, el saldo aparecerá cuando se confirme el pago.
          </div>
        )}
        {topupResult === "cancel" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Carga cancelada. Puedes intentarlo nuevamente.
          </div>
        )}

        <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#8A8170]">Saldo disponible</p>
          {loadError ? (
            <p className="mt-2 text-sm text-red-600">{loadError}</p>
          ) : !wallet ? (
            <p className="mt-2 text-sm text-[#8A8170]">Cargando…</p>
          ) : (
            <>
              <p className="mt-1 text-4xl font-bold text-[#1B4332]">
                {formatCurrencyMXN(wallet.balance_mxn_cents, "es")}
              </p>
              {wallet.held_mxn_cents > 0 && (
                <p className="mt-1 text-xs text-[#8A8170]">
                  Reservado: {formatCurrencyMXN(wallet.held_mxn_cents, "es")}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1B4332]">Cargar saldo</h2>
          <p className="mt-1 text-xs text-[#5C5345]">
            Paga en cualquier OXXO o con tarjeta. El saldo se acredita al confirmarse el pago.
          </p>
          <div className="mt-4 space-y-2">
            {PRESET_AMOUNTS_MXN.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => startTopup(amt)}
                disabled={busyAmount !== null}
                className="w-full rounded-xl border border-[#1B4332] bg-[#1B4332] px-4 py-3 text-base font-medium text-white transition hover:bg-[#143425] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAmount === amt ? "Abriendo pago…" : `Cargar $${amt} MXN`}
              </button>
            ))}
          </div>
          {topupError && (
            <p className="mt-3 text-sm text-red-600">{topupError}</p>
          )}
        </section>

        {wallet && wallet.recent_ledger.length > 0 && (
          <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1B4332]">Últimos movimientos</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {wallet.recent_ledger.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border-b border-[#F2EDE3] pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-[#5C5345]">{e.kind}</span>
                  <span
                    className={
                      e.amount_mxn_cents >= 0
                        ? "font-medium text-emerald-700"
                        : "font-medium text-red-600"
                    }
                  >
                    {e.amount_mxn_cents >= 0 ? "+" : ""}
                    {formatCurrencyMXN(e.amount_mxn_cents, "es")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
