"use client";

import { useMemo, useState } from "react";
import {
  computeServiceMenuQuoteCents,
  type ServiceMenu,
} from "@/lib/listing-service-menu";

/**
 * Seller-side quote builder for service menus (tailoring MVP).
 *
 * Shown inside `ListingChat` when the listing carries a `service_menu`.
 * The seller taps + / − on each menu row, watches the running total, then
 * clicks "Aplicar a precio acordado" — that fills the existing agreed-price
 * input in the parent component. Optionally a formatted item list can be
 * dropped into the chat thread as a regular message.
 *
 * No new APIs, no new DB tables. All money handling reuses the existing
 * `agreedSubtotalMxnCents` flow via the parent.
 */
export default function ServiceMenuQuoteBuilder({
  menu,
  onApplyTotal,
  onInsertAsMessage,
  lang = "es",
  disabled = false,
}: {
  menu: ServiceMenu | null | undefined;
  /** Called with the running total in pesos (string), to drop into the parent's agreedPesos input. */
  onApplyTotal: (pesos: string) => void;
  /** Optional: insert a formatted summary as a chat message. */
  onInsertAsMessage?: (body: string) => Promise<void> | void;
  lang?: "es" | "en";
  disabled?: boolean;
}) {
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const totalCents = useMemo(
    () =>
      computeServiceMenuQuoteCents(
        menu,
        Object.entries(qtyBySku).map(([sku, qty]) => ({ sku, qty }))
      ),
    [menu, qtyBySku]
  );

  if (!menu || !Array.isArray(menu.items) || menu.items.length === 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const change = (sku: string, delta: number) => {
    setQtyBySku((prev) => {
      const next = Math.max(0, (prev[sku] ?? 0) + delta);
      const out = { ...prev };
      if (next === 0) delete out[sku];
      else out[sku] = next;
      return out;
    });
  };

  const clearAll = () => setQtyBySku({});

  const selectedLines = menu.items
    .map((it) => ({ it, qty: qtyBySku[it.sku] ?? 0 }))
    .filter((x) => x.qty > 0);

  const applyDisabled = disabled || totalCents <= 0 || busy;

  const applyToAgreedPrice = () => {
    onApplyTotal(String(totalCents / 100));
  };

  const insertAsMessage = async () => {
    if (!onInsertAsMessage || selectedLines.length === 0) return;
    const lines = selectedLines.map(({ it, qty }) => {
      const label = (lang === "en" && it.name_en) || it.name_es;
      const lineTotal = formatter.format((it.price_mxn_cents * qty) / 100);
      return `• ${qty}× ${label} — ${lineTotal}`;
    });
    const header =
      lang === "en"
        ? "Quote based on the menu:"
        : "Cotización basada en el menú:";
    const totalLine =
      lang === "en"
        ? `Subtotal: ${formatter.format(totalCents / 100)}`
        : `Subtotal: ${formatter.format(totalCents / 100)}`;
    const disclaimer = (lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ?? "";
    const body = [header, ...lines, "", totalLine, disclaimer]
      .filter((s) => s !== null && s !== undefined && String(s).length > 0)
      .join("\n");
    setBusy(true);
    try {
      await onInsertAsMessage(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-2 space-y-2">
      <p className="text-[11px] font-bold text-[#78350F]">
        {lang === "en" ? "Build a quote from your menu" : "Arma un presupuesto desde tu menú"}
      </p>
      <div className="max-h-44 overflow-y-auto divide-y divide-amber-100">
        {menu.items.map((it) => {
          const qty = qtyBySku[it.sku] ?? 0;
          const label = (lang === "en" && it.name_en) || it.name_es;
          return (
            <div key={it.sku} className="flex items-center gap-2 py-1.5 text-[11px]">
              <span className="min-w-0 flex-1 text-[#1C1917]">{label}</span>
              <span className="shrink-0 text-[#6B7280]">
                {formatter.format(it.price_mxn_cents / 100)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => change(it.sku, -1)}
                  disabled={qty === 0 || disabled}
                  className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                  aria-label="−"
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold text-[#78350F]">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => change(it.sku, +1)}
                  disabled={disabled}
                  className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                  aria-label="+"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-amber-200">
        <span className="text-[11px] text-[#78350F]">
          {lang === "en" ? "Quote subtotal" : "Subtotal de la cotización"}
        </span>
        <span className="text-sm font-bold text-[#78350F]">
          {formatter.format(totalCents / 100)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={applyToAgreedPrice}
          disabled={applyDisabled}
          className="flex-1 min-w-[120px] rounded-lg bg-[#B45309] text-white text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
        >
          {lang === "en" ? "Apply to agreed price" : "Aplicar al precio acordado"}
        </button>
        {onInsertAsMessage && (
          <button
            type="button"
            onClick={insertAsMessage}
            disabled={applyDisabled}
            className="rounded-lg border border-amber-300 text-[#78350F] text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
          >
            {lang === "en" ? "Send as message" : "Enviar al chat"}
          </button>
        )}
        <button
          type="button"
          onClick={clearAll}
          disabled={selectedLines.length === 0 || disabled}
          className="rounded-lg border border-amber-200 text-[#92400E] text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
        >
          {lang === "en" ? "Clear" : "Limpiar"}
        </button>
      </div>
      <p className="text-[10px] italic text-[#92400E] leading-snug">
        {(lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ??
          (lang === "en"
            ? "Price may change after physical inspection of the garment."
            : "El precio puede ajustarse al revisar la prenda físicamente.")}
      </p>
    </div>
  );
}
