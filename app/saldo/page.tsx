"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { ledgerKindLabel, saldoCopy } from "@/lib/rides/ui-copy";

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
  const lang = useAppLang();
  const t = saldoCopy(lang);
  const params = useSearchParams();
  const topupResult = params.get("topup");
  const sessionId = params.get("session_id");

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyAmount, setBusyAmount] = useState<number | null>(null);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupDetail, setTopupDetail] = useState<string | null>(null);
  const [oxxoEnabled, setOxxoEnabled] = useState<boolean>(false);
  const [syncingTopup, setSyncingTopup] = useState(false);

  const loadWallet = async () => {
    const r = await fetch("/api/rides/wallet", { credentials: "include", cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setLoadError(data?.error ?? t.loadFailed);
      return null;
    }
    setLoadError(null);
    setWallet(data.wallet ?? null);
    setOxxoEnabled(Boolean(data?.topup?.oxxo));
    return data.wallet as Wallet | null;
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (topupResult === "success" && sessionId?.startsWith("cs_")) {
        setSyncingTopup(true);
        try {
          await fetch(
            `/api/rides/wallet/verify-session?session_id=${encodeURIComponent(sessionId)}`,
            { credentials: "include", cache: "no-store" },
          );
        } catch {
          /* webhook may still credit; poll below */
        } finally {
          if (!cancelled) setSyncingTopup(false);
        }
      }

      let w = await loadWallet();
      if (cancelled) return;

      if (topupResult === "success" && (!w || w.balance_mxn_cents <= 0)) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          if (cancelled) return;
          w = await loadWallet();
          if (w && w.balance_mxn_cents > 0) break;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [topupResult, sessionId, t.loadFailed]);

  async function startTopup(amountMxn: number) {
    setBusyAmount(amountMxn);
    setTopupError(null);
    setTopupDetail(null);
    try {
      const res = await fetch("/api/rides/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount_mxn: amountMxn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setTopupError(data?.error ?? t.topupFailed);
        setTopupDetail(typeof data?.detail === "string" ? data.detail : null);
        setBusyAmount(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setTopupError(t.networkError);
      setBusyAmount(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F4ED] px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-[#1B4332]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#5C5345]">{t.subtitle}</p>
        </header>

        {topupResult === "success" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {oxxoEnabled ? t.topupSuccessOxxo : t.topupSuccessCard}
          </div>
        )}
        {topupResult === "cancel" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t.topupCancel}
          </div>
        )}

        <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#8A8170]">{t.availableBalance}</p>
          {loadError ? (
            <p className="mt-2 text-sm text-red-600">{loadError}</p>
          ) : !wallet ? (
            <p className="mt-2 text-sm text-[#8A8170]">
              {syncingTopup ? t.confirmingPayment : t.loading}
            </p>
          ) : (
            <>
              <p className="mt-1 text-4xl font-bold text-[#1B4332]">
                {formatCurrencyMXN(wallet.balance_mxn_cents, lang)}
              </p>
              {wallet.held_mxn_cents > 0 && (
                <p className="mt-1 text-xs text-[#8A8170]">
                  {t.held} {formatCurrencyMXN(wallet.held_mxn_cents, lang)}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1B4332]">{t.topUpTitle}</h2>
          <p className="mt-1 text-xs text-[#5C5345]">
            {oxxoEnabled ? t.topUpOxxo : t.topUpCard}
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
                {busyAmount === amt ? t.openingPayment : t.loadAmount(amt)}
              </button>
            ))}
          </div>
          {topupError && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-red-600">{topupError}</p>
              {topupDetail && (
                <p className="break-words font-mono text-xs text-red-500">{topupDetail}</p>
              )}
            </div>
          )}
        </section>

        {wallet && wallet.recent_ledger.length > 0 && (
          <section className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#1B4332]">{t.recentActivity}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {wallet.recent_ledger.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border-b border-[#F2EDE3] pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-[#5C5345]">{ledgerKindLabel(e.kind, lang)}</span>
                  <span
                    className={
                      e.amount_mxn_cents >= 0
                        ? "font-medium text-emerald-700"
                        : "font-medium text-red-600"
                    }
                  >
                    {e.amount_mxn_cents >= 0 ? "+" : ""}
                    {formatCurrencyMXN(e.amount_mxn_cents, lang)}
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
