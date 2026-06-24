"use client";

import {
  MAX_SERVICE_MENU_ITEMS,
  emptyServiceMenuFormRow,
  starterMenuForProviderSlug,
  type ServiceMenuFormRow,
} from "@/lib/listing-service-menu";
import { getServiceMenuEditorCopy } from "@/lib/service-menu-editor-copy";

export default function ServiceMenuEditor({
  providerSlug,
  lang = "es",
  rows,
  onRowsChange,
  disabled = false,
}: {
  providerSlug: string;
  lang?: "es" | "en";
  rows: ServiceMenuFormRow[];
  onRowsChange: (rows: ServiceMenuFormRow[]) => void;
  disabled?: boolean;
}) {
  const copy = getServiceMenuEditorCopy(lang, providerSlug);

  const loadTemplate = () => {
    const tpl = starterMenuForProviderSlug(providerSlug);
    if (!tpl) return;
    onRowsChange(
      tpl.items.map((it) => ({
        name_es: it.name_es,
        name_en: it.name_en ?? "",
        pesos: String(it.price_mxn_cents / 100),
      })),
    );
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-semibold text-[#78350F]">{copy.title}</label>
        <button
          type="button"
          onClick={loadTemplate}
          disabled={disabled}
          className="text-[11px] font-semibold text-[#1B4332] underline disabled:opacity-40"
        >
          {copy.templateBtn}
        </button>
      </div>
      <p className="text-xs text-[#92400E]">{copy.hint}</p>

      {rows.length === 0 ? (
        <p className="text-xs italic text-[#A16207]">{copy.empty}</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5rem_2rem] gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#92400E]">
            <span>{copy.colEs}</span>
            <span>{copy.colEn}</span>
            <span>MXN</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_5rem_2rem] gap-2 items-center"
            >
              <input
                type="text"
                value={row.name_es}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], name_es: e.target.value };
                  onRowsChange(next);
                }}
                placeholder={copy.nameEsPh}
                maxLength={80}
                disabled={disabled}
                className="min-w-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#B45309] disabled:opacity-50"
              />
              <input
                type="text"
                value={row.name_en}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], name_en: e.target.value };
                  onRowsChange(next);
                }}
                placeholder={copy.nameEnPh}
                maxLength={80}
                disabled={disabled}
                className="min-w-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#B45309] disabled:opacity-50"
              />
              <div className="relative w-full sm:w-20 shrink-0">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#92400E] text-xs">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={row.pesos}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], pesos: e.target.value };
                    onRowsChange(next);
                  }}
                  placeholder="0"
                  disabled={disabled}
                  className="w-full rounded-lg border border-amber-200 bg-white pl-5 pr-2 py-1.5 text-xs outline-none focus:border-[#B45309] disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={() => onRowsChange(rows.filter((_, idx) => idx !== i))}
                disabled={disabled}
                className="px-2 py-1 text-[#9F1239] text-xs font-bold disabled:opacity-40 justify-self-end"
                aria-label="✕"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (rows.length >= MAX_SERVICE_MENU_ITEMS) return;
          onRowsChange([...rows, emptyServiceMenuFormRow()]);
        }}
        disabled={disabled || rows.length >= MAX_SERVICE_MENU_ITEMS}
        className="w-full rounded-lg border border-dashed border-[#D4A017] py-1.5 text-xs font-semibold text-[#78350F] disabled:opacity-40"
      >
        {copy.addRow} ({rows.length}/{MAX_SERVICE_MENU_ITEMS})
      </button>

      <p className="mt-1 text-[10px] italic text-[#92400E]">{copy.disclaimer}</p>
    </div>
  );
}
