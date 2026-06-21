"use client";

import { useState } from "react";
import { balancePayable, tipPayable } from "@/lib/housekeeping-payments";
import {
  supplementAppointmentLabel,
  supplementSummaryTitle,
} from "@/lib/service-quote-vertical";

type Props = {
  bookingId: string;
  lang: "es" | "en";
  providerSlug?: string | null;
  pricingBaseMxnCents?: number | null;
  commissionAmountCents: number;
  balanceDueMxnCents?: number | null;
  balancePaymentStatus?: string | null;
  balancePaidAt?: string | null;
  tipMxnCents?: number | null;
  tipPaymentStatus?: string | null;
  appointmentAt?: string | null;
  status: string;
  paymentStatus: string;
  sellerConnectReady?: boolean;
  onPaid?: () => void;
};

function fmt(cents: number, lang: "es" | "en") {
  return new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const TIP_PRESETS = [1500, 2000, 3000, 5000] as const;

export default function HousekeepingBookingPayments({
  bookingId,
  lang,
  providerSlug,
  pricingBaseMxnCents,
  commissionAmountCents,
  balanceDueMxnCents,
  balancePaymentStatus,
  balancePaidAt,
  tipMxnCents,
  tipPaymentStatus,
  appointmentAt,
  status,
  paymentStatus,
  sellerConnectReady = true,
  onPaid,
}: Props) {
  const [busy, setBusy] = useState<"balance" | "tip" | null>(null);
  const [err, setErr] = useState("");
  const [customTip, setCustomTip] = useState("");

  const base = Math.round(Number(pricingBaseMxnCents ?? 0));
  const deposit = Math.round(Number(commissionAmountCents ?? 0));
  const balanceDue = Math.round(Number(balanceDueMxnCents ?? 0));
  const showBreakdown = base >= 100;

  const row = {
    id: bookingId,
    status,
    payment_status: paymentStatus,
    balance_due_mxn_cents: balanceDueMxnCents,
    balance_payment_status: balancePaymentStatus,
    tip_payment_status: tipPaymentStatus,
  };

  const canPayBalance =
    balancePayable(row as Parameters<typeof balancePayable>[0]) && sellerConnectReady;
  const balanceBlockedNoConnect =
    balancePayable(row as Parameters<typeof balancePayable>[0]) && !sellerConnectReady;
  const canTip = tipPayable(row as Parameters<typeof tipPayable>[0]) && sellerConnectReady;

  const t =
    lang === "es"
      ? {
          title: supplementSummaryTitle(providerSlug, lang),
          quoteTotal: "Total cotizado",
          deposit: "Depósito pagado (plataforma)",
          balanceDue: "Saldo del servicio",
          balancePaid: "Saldo pagado",
          balanceWaived: "Sin saldo pendiente",
          payBalance: "Pagar saldo en la app",
          tipTitle: "Propina (opcional)",
          tipPaid: "Propina enviada",
          tipPreset: "Elegir propina",
          tipCustom: "Otra cantidad (MXN)",
          payTip: "Enviar propina",
          appointment: supplementAppointmentLabel(providerSlug, lang),
          connectBlock:
            "El proveedor aún no activó Stripe Connect en Naranjogo. Paga el saldo directamente al proveedor por WhatsApp hasta que active cobros en la app.",
          connectBlockShort:
            "El proveedor debe activar Stripe Connect en Mi perfil antes de que puedas pagar el saldo en la app. Coordina el pago por WhatsApp mientras tanto.",
        }
      : {
          title: supplementSummaryTitle(providerSlug, lang),
          quoteTotal: "Quoted total",
          deposit: "Deposit paid (platform)",
          balanceDue: "Service balance",
          balancePaid: "Balance paid",
          balanceWaived: "No balance due",
          payBalance: "Pay balance in app",
          tipTitle: "Tip (optional)",
          tipPaid: "Tip sent",
          tipPreset: "Choose a tip",
          tipCustom: "Custom amount (MXN)",
          payTip: "Send tip",
          appointment: supplementAppointmentLabel(providerSlug, lang),
          connectBlock:
            "Your provider has not enabled Stripe Connect on Naranjogo yet. Pay the service balance directly via WhatsApp until in-app payouts are active.",
          connectBlockShort:
            "The provider must enable Stripe Connect in Profile before you can pay the balance in the app. Coordinate payment on WhatsApp for now.",
        };

  const startCheckout = async (kind: "balance" | "tip", tipCents?: number) => {
    setBusy(kind);
    setErr("");
    try {
      const url =
        kind === "balance"
          ? `/api/bookings/${encodeURIComponent(bookingId)}/balance-checkout`
          : `/api/bookings/${encodeURIComponent(bookingId)}/tip-checkout`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: kind === "tip" ? JSON.stringify({ tipMxnCents: tipCents }) : "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string };
      if (!res.ok) {
        if (data.error === "provider_connect_required") {
          throw new Error((data as { message?: string }).message ?? t.connectBlockShort);
        }
        throw new Error(data.error ?? data.message ?? "Error");
      }
      if (data.url) window.location.href = data.url;
      else throw new Error("No checkout URL");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const payCustomTip = () => {
    const pesos = Math.round(Number(customTip.replace(/[^\d.]/g, "")));
    if (!Number.isFinite(pesos) || pesos < 1) {
      setErr(lang === "es" ? "Monto inválido" : "Invalid amount");
      return;
    }
    void startCheckout("tip", pesos * 100);
  };

  if (!showBreakdown && !appointmentAt) return null;

  return (
    <div className="mt-3 rounded-xl border border-[#D4A017]/40 bg-[#FFFBEB] px-3 py-3 space-y-2">
      <p className="text-xs font-bold text-[#78350F]">{t.title}</p>

      {appointmentAt ? (
        <p className="text-[11px] text-[#92400E]">
          📅 {t.appointment}:{" "}
          {new Date(appointmentAt).toLocaleString(lang === "es" ? "es-MX" : "en-MX", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      ) : null}

      {showBreakdown ? (
        <div className="text-[11px] text-[#78350F] space-y-1">
          <p>
            <span className="text-[#92400E]">{t.quoteTotal}:</span>{" "}
            <span className="font-semibold">{fmt(base, lang)}</span>
          </p>
          <p>
            <span className="text-[#92400E]">{t.deposit}:</span>{" "}
            <span className="font-semibold">{fmt(deposit, lang)}</span>
          </p>
          {status === "completed" ? (
            <p>
              <span className="text-[#92400E]">
                {String(balancePaymentStatus) === "paid"
                  ? t.balancePaid
                  : String(balancePaymentStatus) === "waived" || balanceDue < 100
                    ? t.balanceWaived
                    : t.balanceDue}
                :
              </span>{" "}
              <span className="font-semibold">
                {String(balancePaymentStatus) === "paid" || String(balancePaymentStatus) === "waived"
                  ? fmt(balanceDue, lang)
                  : fmt(balanceDue, lang)}
              </span>
              {balancePaidAt ? (
                <span className="text-[#A16207] ml-1">
                  ·{" "}
                  {new Date(balancePaidAt).toLocaleDateString(lang === "es" ? "es-MX" : "en-MX", {
                    dateStyle: "short",
                  })}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {canPayBalance ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            void startCheckout("balance").then(() => onPaid?.());
          }}
          className="w-full py-2.5 rounded-xl bg-[#1B4332] text-white text-xs font-semibold disabled:opacity-50"
        >
          {busy === "balance" ? "…" : `${t.payBalance} (${fmt(balanceDue, lang)})`}
        </button>
      ) : null}

      {balanceBlockedNoConnect ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
          <p className="font-semibold mb-1">{t.balanceDue}: {fmt(balanceDue, lang)}</p>
          <p>{t.connectBlockShort}</p>
        </div>
      ) : null}

      {canTip ? (
        <div className="pt-2 border-t border-[#FDE68A] space-y-2">
          <p className="text-[11px] font-semibold text-[#78350F]">{t.tipTitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {TIP_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy !== null}
                onClick={() => void startCheckout("tip", c)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D4A017] text-[11px] font-semibold text-[#78350F] bg-white hover:bg-[#FEF3C7] disabled:opacity-50"
              >
                {fmt(c, lang)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={customTip}
              onChange={(e) => setCustomTip(e.target.value)}
              placeholder={t.tipCustom}
              className="flex-1 border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => payCustomTip()}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold disabled:opacity-50"
            >
              {busy === "tip" ? "…" : t.payTip}
            </button>
          </div>
        </div>
      ) : null}

      {String(tipPaymentStatus) === "paid" && tipMxnCents != null && tipMxnCents >= 100 ? (
        <p className="text-[11px] text-emerald-800 font-medium">
          ✓ {t.tipPaid}: {fmt(tipMxnCents, lang)}
        </p>
      ) : null}

      {err ? <p className="text-[11px] text-red-600">{err}</p> : null}
    </div>
  );
}
