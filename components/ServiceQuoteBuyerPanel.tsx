"use client";

import { useState } from "react";
import { formatMxn, quoteStatusLabel, type ServiceQuoteStatus } from "@/lib/service-quote";

export default function ServiceQuoteBuyerPanel({
  listingId,
  quoteStatus,
  agreedSubtotalMxnCents,
  quoteSentAt,
  lang = "es",
  disabled = false,
  onResponded,
}: {
  listingId: string;
  quoteStatus: ServiceQuoteStatus;
  agreedSubtotalMxnCents: number | null;
  quoteSentAt?: string | null;
  lang?: "es" | "en";
  disabled?: boolean;
  onResponded?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  if (quoteStatus === "none" || quoteStatus === "declined") {
    if (quoteStatus === "declined") {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {lang === "en"
            ? "You declined the last quote. Wait for a revised quote from your provider."
            : "Rechazaste la última cotización. Espera una cotización revisada de tu proveedor."}
        </div>
      );
    }
    return null;
  }

  const totalLabel =
    agreedSubtotalMxnCents != null && agreedSubtotalMxnCents > 0
      ? formatMxn(agreedSubtotalMxnCents, lang)
      : null;

  const respond = async (action: "accept" | "decline") => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/quote/respond`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || undefined, lang }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
      onResponded?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (quoteStatus === "accepted") {
    return (
      <div id="service-quote-panel" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 space-y-1 text-xs text-emerald-900">
        <p className="font-semibold">
          {lang === "en" ? "Quote accepted" : "Cotización aceptada"}
          {totalLabel ? ` — ${totalLabel}` : ""}
        </p>
        <p>
          {lang === "en"
            ? "Pay the deposit (platform fee) in the booking section below to confirm your service."
            : "Paga el depósito (tarifa de plataforma) en la sección de reserva abajo para confirmar tu servicio."}
        </p>
      </div>
    );
  }

  return (
    <div id="service-quote-panel" className="rounded-lg border border-[#1B4332]/30 bg-[#ECFDF5] px-3 py-3 space-y-2 text-xs">
      <p className="font-bold text-[#065F46]">
        {lang === "en" ? "Official quote from your provider" : "Cotización oficial de tu proveedor"}
      </p>
      <p className="text-[#047857]">{quoteStatusLabel("pending", lang)}</p>
      {totalLabel ? (
        <p className="text-lg font-bold text-[#065F46]">{totalLabel}</p>
      ) : null}
      {quoteSentAt ? (
        <p className="text-[10px] text-[#6B7280]">
          {lang === "en" ? "Sent" : "Enviada"}: {new Date(quoteSentAt).toLocaleString(lang === "en" ? "en-MX" : "es-MX")}
        </p>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy || disabled}
        rows={2}
        maxLength={500}
        placeholder={lang === "en" ? "Optional note…" : "Nota opcional…"}
        className="w-full rounded-lg border border-emerald-200 px-2 py-1.5 text-[11px] outline-none focus:border-[#1B4332] disabled:opacity-50"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void respond("accept")}
          className="flex-1 min-w-[120px] rounded-lg bg-[#1B4332] text-white text-[11px] font-semibold py-2 disabled:opacity-40"
        >
          {busy ? "…" : lang === "en" ? "Accept quote" : "Aceptar cotización"}
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void respond("decline")}
          className="rounded-lg border border-red-300 text-red-800 text-[11px] font-semibold px-3 py-2 disabled:opacity-40"
        >
          {lang === "en" ? "Decline" : "Rechazar"}
        </button>
      </div>
      {err ? <p className="text-red-600">{err}</p> : null}
    </div>
  );
}
