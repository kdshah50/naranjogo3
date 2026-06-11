"use client";

import { useMemo, useState } from "react";
import {
  computeHousekeepingQuoteTotals,
  computeServiceMenuQuoteCents,
  housekeepingAgreedPriceCents,
  HOUSEKEEPING_QUICK_QUOTE_GROUPS,
  HOUSEKEEPING_VISIT_FREQUENCIES,
  type HousekeepingQuoteBasis,
  type HousekeepingVisitFrequency,
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
  quoteLayout = "default",
}: {
  menu: ServiceMenu | null | undefined;
  /** Called with the running total in pesos (string), to drop into the parent's agreedPesos input. */
  onApplyTotal: (pesos: string) => void;
  /** Optional: insert a formatted summary as a chat message. */
  onInsertAsMessage?: (body: string) => Promise<void> | void;
  lang?: "es" | "en";
  disabled?: boolean;
  /** Housekeeping: show quick room-type qty picks above the full menu list. */
  quoteLayout?: "default" | "housekeeping";
}) {
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [visitFrequency, setVisitFrequency] = useState<HousekeepingVisitFrequency>("one_time");
  const [quoteBasis, setQuoteBasis] = useState<HousekeepingQuoteBasis>("per_visit");

  const cartLines = useMemo(
    () => Object.entries(qtyBySku).map(([sku, qty]) => ({ sku, qty })),
    [qtyBySku],
  );

  const housekeepingTotals = useMemo(
    () =>
      quoteLayout === "housekeeping"
        ? computeHousekeepingQuoteTotals(menu, cartLines, visitFrequency)
        : null,
    [quoteLayout, menu, cartLines, visitFrequency],
  );

  const isRecurring =
    quoteLayout === "housekeeping" && visitFrequency !== "one_time";

  const totalCents = useMemo(() => {
    if (quoteLayout === "housekeeping" && housekeepingTotals) {
      return housekeepingAgreedPriceCents(housekeepingTotals, quoteBasis);
    }
    return computeServiceMenuQuoteCents(menu, cartLines);
  }, [quoteLayout, housekeepingTotals, quoteBasis, menu, cartLines]);

  const menuSkus = useMemo(
    () => new Set((menu?.items ?? []).map((it) => it.sku)),
    [menu],
  );

  if (!menu || !Array.isArray(menu.items) || menu.items.length === 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const change = (sku: string, delta: number, alsoSetSku?: string) => {
    setQtyBySku((prev) => {
      const nextQty = Math.max(0, (prev[sku] ?? 0) + delta);
      const out = { ...prev };
      if (nextQty === 0) delete out[sku];
      else out[sku] = nextQty;

      if (alsoSetSku && nextQty > 0 && (out[alsoSetSku] ?? 0) === 0) {
        out[alsoSetSku] = 1;
      }
      return out;
    });
  };

  const quickGroups =
    quoteLayout === "housekeeping"
      ? HOUSEKEEPING_QUICK_QUOTE_GROUPS.filter((g) => menuSkus.has(g.sku))
      : [];

  const clearAll = () => {
    setQtyBySku({});
    setVisitFrequency("one_time");
    setQuoteBasis("per_visit");
  };

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
    const freqRow = HOUSEKEEPING_VISIT_FREQUENCIES.find((f) => f.id === visitFrequency);
    const freqLabel =
      quoteLayout === "housekeeping" && freqRow
        ? lang === "en"
          ? freqRow.label_en
          : freqRow.label_es
        : null;
    const header =
      lang === "en"
        ? "Quote based on the menu:"
        : "Cotización basada en el menú:";
    const freqLine =
      freqLabel && quoteLayout === "housekeeping"
        ? lang === "en"
          ? `Frequency: ${freqLabel}`
          : `Frecuencia: ${freqLabel}`
        : null;
    const basisLine =
      quoteLayout === "housekeeping" && housekeepingTotals && isRecurring
        ? lang === "en"
          ? `Agreed basis: ${quoteBasis === "monthly_package" ? "Monthly package" : "Per visit"}`
          : `Base acordada: ${quoteBasis === "monthly_package" ? "Paquete mensual" : "Por visita"}`
        : null;
    const totalLine =
      quoteLayout === "housekeeping" && housekeepingTotals && isRecurring
        ? lang === "en"
          ? `Per visit: ${formatter.format(housekeepingTotals.perVisitCents / 100)} · Monthly package (${housekeepingTotals.visitsPerMonth} visits): ${formatter.format(housekeepingTotals.monthlyPackageCents / 100)} · Applied: ${formatter.format(totalCents / 100)}`
          : `Por visita: ${formatter.format(housekeepingTotals.perVisitCents / 100)} · Paquete mensual (${housekeepingTotals.visitsPerMonth} visitas): ${formatter.format(housekeepingTotals.monthlyPackageCents / 100)} · Aplicado: ${formatter.format(totalCents / 100)}`
        : lang === "en"
          ? `Subtotal: ${formatter.format(totalCents / 100)}`
          : `Subtotal: ${formatter.format(totalCents / 100)}`;
    const disclaimer = (lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ?? "";
    const body = [header, freqLine, basisLine, ...lines, "", totalLine, disclaimer]
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
      {quickGroups.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-[#92400E]">
            {lang === "en" ? "Quick room counts" : "Cantidades rápidas por cuarto"}
          </p>
          {quickGroups.map((g) => {
            const qty = qtyBySku[g.sku] ?? 0;
            const label = lang === "en" ? g.label_en : g.label_es;
            const item = menu!.items.find((it) => it.sku === g.sku);
            return (
              <div key={g.sku} className="flex items-center gap-2 py-0.5 text-[11px]">
                <span className="min-w-0 flex-1 text-[#1C1917]">{label}</span>
                {item ? (
                  <span className="shrink-0 text-[#6B7280]">
                    {formatter.format(item.price_mxn_cents / 100)}
                  </span>
                ) : null}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => change(g.sku, -1, g.alsoSetSku)}
                    disabled={qty === 0 || disabled}
                    className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                    aria-label="−"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-semibold text-[#78350F]">{qty}</span>
                  <button
                    type="button"
                    onClick={() => change(g.sku, +1, g.alsoSetSku)}
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
      )}
      {quoteLayout === "housekeeping" && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2 space-y-1.5">
          <label className="block text-[10px] font-semibold text-[#92400E]">
            {lang === "en" ? "Visit frequency" : "Frecuencia de visitas"}
          </label>
          <select
            value={visitFrequency}
            onChange={(e) => {
              const next = e.target.value as HousekeepingVisitFrequency;
              setVisitFrequency(next);
              if (next === "one_time") setQuoteBasis("per_visit");
            }}
            disabled={disabled}
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-[#1C1917] outline-none focus:border-[#B45309] disabled:opacity-50"
          >
            {HOUSEKEEPING_VISIT_FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>
                {lang === "en" ? f.label_en : f.label_es}
              </option>
            ))}
          </select>
          {housekeepingTotals && housekeepingTotals.perVisitCents > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#78350F]">
                  {lang === "en" ? "Per visit" : "Por visita"}
                </span>
                <span className="font-semibold text-[#78350F]">
                  {formatter.format(housekeepingTotals.perVisitCents / 100)}
                </span>
              </div>
              {isRecurring && (
                <>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#78350F]">
                      {lang === "en"
                        ? `Monthly package (${housekeepingTotals.visitsPerMonth} visits)`
                        : `Paquete mensual (${housekeepingTotals.visitsPerMonth} visitas)`}
                    </span>
                    <span className="font-semibold text-[#78350F]">
                      {formatter.format(housekeepingTotals.monthlyPackageCents / 100)}
                    </span>
                  </div>
                  <fieldset className="space-y-1">
                    <legend className="text-[10px] font-semibold text-[#92400E]">
                      {lang === "en" ? "Apply to agreed price" : "Aplicar al precio acordado"}
                    </legend>
                    <label className="flex items-center gap-2 text-[11px] text-[#1C1917] cursor-pointer">
                      <input
                        type="radio"
                        name="quote-basis"
                        checked={quoteBasis === "per_visit"}
                        onChange={() => setQuoteBasis("per_visit")}
                        disabled={disabled}
                        className="accent-[#B45309]"
                      />
                      {lang === "en" ? "Per visit amount" : "Monto por visita"}
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[#1C1917] cursor-pointer">
                      <input
                        type="radio"
                        name="quote-basis"
                        checked={quoteBasis === "monthly_package"}
                        onChange={() => setQuoteBasis("monthly_package")}
                        disabled={disabled}
                        className="accent-[#B45309]"
                      />
                      {lang === "en" ? "Monthly package total" : "Total paquete mensual"}
                    </label>
                  </fieldset>
                </>
              )}
            </div>
          )}
        </div>
      )}
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
          {quoteLayout === "housekeeping" && isRecurring
            ? quoteBasis === "monthly_package"
              ? lang === "en"
                ? "Monthly package (agreed)"
                : "Paquete mensual (acordado)"
              : lang === "en"
                ? "Per visit (agreed)"
                : "Por visita (acordado)"
            : lang === "en"
              ? "Quote subtotal"
              : "Subtotal de la cotización"}
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
