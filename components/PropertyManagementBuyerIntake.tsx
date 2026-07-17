"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_COLONIA_KEYS, COLONIAS } from "@/lib/colonias";
import type { Lang } from "@/lib/i18n-lang";
import {
  PM_BUYER_INTAKE_STORAGE_KEY,
  type PmBuyerIntake,
} from "@/lib/property-management";

type Props = { lang: Lang };

export default function PropertyManagementBuyerIntake({ lang }: Props) {
  const router = useRouter();
  const [colonia, setColonia] = useState("");
  const [propertyType, setPropertyType] = useState<"house" | "condo">("house");
  const [occupancy, setOccupancy] = useState<"occupied" | "vacant">("vacant");
  const [use, setUse] = useState<"personal" | "rental">("personal");
  const [addressNote, setAddressNote] = useState("");

  const colonias = useMemo(
    () =>
      ALL_COLONIA_KEYS.map((key) => ({
        value: key,
        label: lang === "en" ? COLONIAS[key].label_en : COLONIAS[key].label,
      })),
    [lang],
  );

  const t =
    lang === "es"
      ? {
          title: "Cuéntanos sobre tu propiedad",
          sub: "Toma menos de un minuto. Los proveedores ven este contexto al abrir la consulta.",
          colonia: "Colonia",
          type: "Tipo de propiedad",
          house: "Casa",
          condo: "Condominio / depto",
          occupancy: "¿Ocupada o vacía?",
          occupied: "Ocupada",
          vacant: "Vacía / ausente",
          use: "Uso",
          personal: "Uso personal / familia",
          rental: "Se renta (Airbnb / huéspedes)",
          notes: "Dirección o notas (opcional)",
          notesPh: "Ej. cerca del Jardín, 2 niveles, alberca…",
          cta: "Ver administradores →",
          skip: "Saltar e ir al directorio",
        }
      : {
          title: "Tell us about your property",
          sub: "Under a minute. Providers see this context when you request a consultation.",
          colonia: "Colonia",
          type: "Property type",
          house: "House",
          condo: "Condo / apartment",
          occupancy: "Occupied or vacant?",
          occupied: "Occupied",
          vacant: "Vacant / absentee",
          use: "Use",
          personal: "Personal / family use",
          rental: "Rental (Airbnb / guests)",
          notes: "Address or notes (optional)",
          notesPh: "e.g. near El Jardín, 2 levels, pool…",
          cta: "Browse managers →",
          skip: "Skip to directory",
        };

  const saveAndBrowse = (intake: PmBuyerIntake | null) => {
    try {
      if (intake) {
        sessionStorage.setItem(PM_BUYER_INTAKE_STORAGE_KEY, JSON.stringify(intake));
      } else {
        sessionStorage.removeItem(PM_BUYER_INTAKE_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    const q =
      lang === "es" ? "administración de propiedades" : "property management";
    const coloniaQs = intake?.colonia ? `&colonia=${encodeURIComponent(intake.colonia)}` : "";
    router.push(`/?category=services&q=${encodeURIComponent(q)}&lang=${lang}${coloniaQs}`);
  };

  return (
    <div className="rounded-2xl border border-[#E5E0D8] bg-white p-5 sm:p-6 shadow-sm text-left">
      <h3 className="font-serif text-lg font-bold text-[#1B4332] mb-1">{t.title}</h3>
      <p className="text-xs text-[#6B7280] mb-4 leading-relaxed">{t.sub}</p>
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.colonia}</label>
          <select
            value={colonia}
            onChange={(e) => setColonia(e.target.value)}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          >
            <option value="">—</option>
            {colonias.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-[#6B7280] mb-1">{t.type}</legend>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["house", t.house],
                ["condo", t.condo],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setPropertyType(v)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                  propertyType === v
                    ? "border-[#1B4332] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#E5E0D8] text-[#374151]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold text-[#6B7280] mb-1">{t.occupancy}</legend>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["occupied", t.occupied],
                ["vacant", t.vacant],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setOccupancy(v)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                  occupancy === v
                    ? "border-[#1B4332] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#E5E0D8] text-[#374151]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold text-[#6B7280] mb-1">{t.use}</legend>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                ["personal", t.personal],
                ["rental", t.rental],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setUse(v)}
                className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                  use === v
                    ? "border-[#1B4332] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#E5E0D8] text-[#374151]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.notes}</label>
          <input
            value={addressNote}
            onChange={(e) => setAddressNote(e.target.value)}
            placeholder={t.notesPh}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B4332]"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            saveAndBrowse({
              colonia,
              property_type: propertyType,
              occupancy,
              use,
              address_note: addressNote.trim() || undefined,
            })
          }
          className="w-full mt-1 bg-[#1B4332] text-white font-bold text-sm py-3 rounded-xl hover:bg-[#2D6A4F] transition-colors"
        >
          {t.cta}
        </button>
        <button
          type="button"
          onClick={() => saveAndBrowse(null)}
          className="text-xs text-[#6B7280] hover:text-[#1B4332] underline underline-offset-2"
        >
          {t.skip}
        </button>
      </div>
    </div>
  );
}
