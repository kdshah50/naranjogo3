"use client";

import {
  MAX_SERVICE_MENU_ITEMS,
  starterMenuForProviderSlug,
  type ServiceMenuFormRow,
  type ServiceMenuItem,
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
      tpl.items.map((it: ServiceMenuItem) => ({
        name: lang === "en" && it.name_en ? it.name_en : it.name_es,
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
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], name: e.target.value };
                  onRowsChange(next);
                }}
                placeholder={copy.namePh}
                maxLength={80}
                disabled={disabled}
                className="flex-1 min-w-0 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#B45309] disabled:opacity-50"
              />
              <div className="relative w-24 shrink-0">
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
                className="px-2 py-1 text-[#9F1239] text-xs font-bold disabled:opacity-40"
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
          onRowsChange([...rows, { name: "", pesos: "" }]);
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
