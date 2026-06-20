"use client";

import { useEffect, useState } from "react";

type ConnectStatus = {
  linked: boolean;
  payoutReady: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  transfersCapability: string | null;
};

export default function SellerStripePayoutCard({
  lang,
  hasStripeConnect,
  stripeReturn,
}: {
  lang: "es" | "en";
  hasStripeConnect?: boolean;
  /** profile?stripe_connect=done|refresh from Stripe redirect */
  stripeReturn?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ConnectStatus | null>(null);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/stripe/connect/status", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      setStatus((await r.json()) as ConnectStatus);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [hasStripeConnect, stripeReturn]);

  const start = async (mode: "onboarding" | "dashboard") => {
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/connect/onboarding", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "dashboard" ? { mode: "dashboard" } : hasStripeConnect ? {} : { email: email.trim() },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg((data as { error?: string }).error ?? "Error");
        return;
      }
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      setMsg(lang === "en" ? "Could not start Stripe" : "No se pudo abrir Stripe");
    } finally {
      setBusy(false);
    }
  };

  const payoutReady = status?.payoutReady === true;
  const linked = status?.linked === true || hasStripeConnect;

  return (
    <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 mb-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-2">
        {lang === "en" ? "Stripe payouts (cart + cleaning balance)" : "Cobros Stripe (carrito + saldo limpieza)"}
      </h2>
      <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
        {lang === "en"
          ? "Required for housekeeping service balance ($272-style payouts) and optional full cart payouts. Buyers pay the platform deposit first; the job balance transfers to you after completion when Connect is active."
          : "Necesario para recibir el saldo de limpieza en la app (después del depósito de plataforma) y cobros del carrito. Los clientes pagan primero el depósito; el saldo del trabajo se transfiere a ti al completar el servicio cuando Connect está activo."}
      </p>

      {stripeReturn === "done" && !payoutReady ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {lang === "en"
            ? "Stripe redirect received — if balance pay still fails, reopen onboarding below and finish all steps (test mode: use Stripe test data)."
            : "Volviste de Stripe — si el saldo aún no se puede pagar en la app, abre de nuevo la verificación abajo y completa todos los pasos (modo prueba: usa datos de prueba de Stripe)."}
        </p>
      ) : null}

      {payoutReady ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          {lang === "en"
            ? "✓ Payouts active — buyers can pay cleaning balance in the app."
            : "✓ Cobros activos — los clientes pueden pagar el saldo de limpieza en la app."}
        </p>
      ) : linked ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {lang === "en"
            ? "Stripe linked but not fully verified yet — complete onboarding (charges/transfers must be active)."
            : "Stripe vinculado pero verificación incompleta — termina el registro (cobros/transferencias deben estar activos)."}
        </p>
      ) : null}

      {!linked && (
        <>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">
            {lang === "en" ? "Email for Stripe" : "Correo para Stripe"}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full border border-[#E5E0D8] rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:border-[#1B4332]"
          />
        </>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void start(linked && payoutReady ? "dashboard" : "onboarding")}
          className="w-full py-3 rounded-xl bg-[#635BFF] text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy
            ? "…"
            : linked && payoutReady
              ? lang === "en"
                ? "Open Stripe Express dashboard"
                : "Abrir panel Stripe Express"
              : linked
                ? lang === "en"
                  ? "Finish Stripe verification"
                  : "Terminar verificación Stripe"
                : lang === "en"
                  ? "Continue with Stripe"
                  : "Continuar con Stripe"}
        </button>
        {linked && !payoutReady ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start("onboarding")}
            className="w-full py-2.5 rounded-xl border border-[#635BFF] text-[#635BFF] text-xs font-semibold disabled:opacity-50"
          >
            {lang === "en" ? "Re-open onboarding link" : "Reabrir enlace de registro"}
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-3 text-xs text-red-600">{msg}</p> : null}
    </div>
  );
}
