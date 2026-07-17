"use client";

import {
  PM_PACKAGE_TIERS,
  PM_PROPERTY_TYPES,
  PM_SUB_SERVICES,
  type PmPackageQuote,
  type PmPropertyType,
  type PmReference,
  type PmSubService,
} from "@/lib/property-management";
import type { Lang } from "@/lib/i18n-lang";

export type PmSignupFormSlice = {
  business_legal_name: string;
  years_in_sma: string;
  insurance_company: string;
  insurance_policy_ref: string;
  insurance_declared: boolean;
  reference1_name: string;
  reference1_phone: string;
  reference2_name: string;
  reference2_phone: string;
  pm_sub_services: PmSubService[];
  pm_packages: PmPackageQuote[];
  pm_property_types: PmPropertyType[];
  max_properties: string;
};

type Props = {
  lang: Lang;
  value: PmSignupFormSlice;
  onChange: (patch: Partial<PmSignupFormSlice>) => void;
  /** "info" = step 1 vetting; "service" = step 2 packages */
  section: "info" | "service";
};

export function defaultPmSignupSlice(): PmSignupFormSlice {
  return {
    business_legal_name: "",
    years_in_sma: "",
    insurance_company: "",
    insurance_policy_ref: "",
    insurance_declared: false,
    reference1_name: "",
    reference1_phone: "",
    reference2_name: "",
    reference2_phone: "",
    pm_sub_services: ["property_watch"],
    pm_packages: PM_PACKAGE_TIERS.map((t) => ({
      tier: t.value,
      from_mxn: t.defaultFromMxn,
      to_mxn: t.defaultToMxn,
    })),
    pm_property_types: ["both"],
    max_properties: "",
  };
}

export function pmSignupValidationError(
  slice: PmSignupFormSlice,
  lang: Lang,
): string | null {
  if (!slice.business_legal_name.trim()) {
    return lang === "es"
      ? "Indica la razón social o nombre comercial."
      : "Enter your business / legal name.";
  }
  if (!slice.years_in_sma.trim() || Number(slice.years_in_sma) < 0) {
    return lang === "es"
      ? "Indica años operando en SMA."
      : "Enter years operating in SMA.";
  }
  if (!slice.insurance_declared) {
    return lang === "es"
      ? "Debes declarar si cuentas con seguro o fianza."
      : "Confirm whether you carry insurance or bonding.";
  }
  const refs: PmReference[] = [
    { name: slice.reference1_name, phone: slice.reference1_phone },
    { name: slice.reference2_name, phone: slice.reference2_phone },
  ];
  if (refs.some((r) => !r.name.trim() || !r.phone.trim())) {
    return lang === "es"
      ? "Se requieren 2 referencias de clientes (nombre y teléfono)."
      : "Two client references (name + phone) are required.";
  }
  if (slice.pm_sub_services.length === 0) {
    return lang === "es"
      ? "Elige al menos un sub-servicio."
      : "Pick at least one sub-service.";
  }
  if (slice.pm_packages.length === 0) {
    return lang === "es"
      ? "Define al menos un paquete mensual."
      : "Define at least one monthly package.";
  }
  return null;
}

export default function PropertyManagementSignupFields({
  lang,
  value,
  onChange,
  section,
}: Props) {
  const t =
    lang === "es"
      ? {
          infoTitle: "Verificación — administración de propiedades",
          infoHint:
            "Mayor confianza: llaves y acceso a hogares. Revisamos estos datos antes de publicar.",
          business: "Razón social / nombre comercial",
          years: "Años operando en SMA",
          insuranceCo: "Aseguradora o afianzadora",
          policy: "Póliza / referencia (opcional)",
          insuranceCheck: "Declaro contar con seguro de responsabilidad o fianza vigente",
          ref1: "Referencia 1 — nombre",
          ref1ph: "Referencia 1 — WhatsApp / teléfono",
          ref2: "Referencia 2 — nombre",
          ref2ph: "Referencia 2 — WhatsApp / teléfono",
          svcTitle: "Paquetes y cobertura",
          svcHint: "Precios mensuales en MXN (retainer). El anuncio mostrará “desde $X/mes”.",
          subs: "Sub-servicios que ofreces",
          types: "Tipos de propiedad que atiendes",
          maxProps: "Máximo de propiedades bajo tu gestión (opcional)",
          pkgFrom: "Desde",
          pkgTo: "Hasta",
          perMo: "MXN / mes",
        }
      : {
          infoTitle: "Verification — property management",
          infoHint:
            "Higher trust bar: keys and home access. We review these before publishing.",
          business: "Legal / business name",
          years: "Years operating in SMA",
          insuranceCo: "Insurer or bonding company",
          policy: "Policy / reference (optional)",
          insuranceCheck: "I declare I carry current liability insurance or bonding",
          ref1: "Reference 1 — name",
          ref1ph: "Reference 1 — WhatsApp / phone",
          ref2: "Reference 2 — name",
          ref2ph: "Reference 2 — WhatsApp / phone",
          svcTitle: "Packages & coverage",
          svcHint: "Monthly MXN retainers. The listing shows “from $X/mo”.",
          subs: "Sub-services you offer",
          types: "Property types you serve",
          maxProps: "Max properties under management (optional)",
          pkgFrom: "From",
          pkgTo: "To",
          perMo: "MXN / mo",
        };

  if (section === "info") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold text-amber-950">{t.infoTitle}</p>
          <p className="text-[11px] text-amber-900/90 leading-snug mt-0.5">{t.infoHint}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.business}</label>
          <input
            value={value.business_legal_name}
            onChange={(e) => onChange({ business_legal_name: e.target.value })}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.years}</label>
          <input
            type="number"
            min={0}
            max={80}
            value={value.years_in_sma}
            onChange={(e) => onChange({ years_in_sma: e.target.value })}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.insuranceCo}</label>
          <input
            value={value.insurance_company}
            onChange={(e) => onChange({ insurance_company: e.target.value })}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.policy}</label>
          <input
            value={value.insurance_policy_ref}
            onChange={(e) => onChange({ insurance_policy_ref: e.target.value })}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-[#374151] cursor-pointer">
          <input
            type="checkbox"
            checked={value.insurance_declared}
            onChange={(e) => onChange({ insurance_declared: e.target.checked })}
            className="accent-[#1B4332] mt-0.5"
          />
          <span>{t.insuranceCheck}</span>
        </label>
        <div className="grid grid-cols-1 gap-2 pt-1">
          <input
            value={value.reference1_name}
            onChange={(e) => onChange({ reference1_name: e.target.value })}
            placeholder={t.ref1}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
          <input
            value={value.reference1_phone}
            onChange={(e) => onChange({ reference1_phone: e.target.value })}
            placeholder={t.ref1ph}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
          <input
            value={value.reference2_name}
            onChange={(e) => onChange({ reference2_name: e.target.value })}
            placeholder={t.ref2}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
          <input
            value={value.reference2_phone}
            onChange={(e) => onChange({ reference2_phone: e.target.value })}
            placeholder={t.ref2ph}
            className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
          />
        </div>
      </div>
    );
  }

  const toggleSub = (slug: PmSubService) => {
    const has = value.pm_sub_services.includes(slug);
    onChange({
      pm_sub_services: has
        ? value.pm_sub_services.filter((x) => x !== slug)
        : [...value.pm_sub_services, slug],
    });
  };

  const toggleType = (slug: PmPropertyType) => {
    const has = value.pm_property_types.includes(slug);
    onChange({
      pm_property_types: has
        ? value.pm_property_types.filter((x) => x !== slug)
        : [...value.pm_property_types, slug],
    });
  };

  const patchPackage = (tier: PmPackageQuote["tier"], field: "from_mxn" | "to_mxn", raw: string) => {
    const n = Math.max(0, Math.round(Number(raw.replace(/[^0-9.]/g, "")) || 0));
    onChange({
      pm_packages: value.pm_packages.map((p) =>
        p.tier === tier ? { ...p, [field]: n } : p,
      ),
    });
  };

  const ensurePackage = (tier: PmPackageQuote["tier"], enabled: boolean) => {
    if (enabled) {
      if (value.pm_packages.some((p) => p.tier === tier)) return;
      const def = PM_PACKAGE_TIERS.find((t) => t.value === tier)!;
      onChange({
        pm_packages: [
          ...value.pm_packages,
          { tier, from_mxn: def.defaultFromMxn, to_mxn: def.defaultToMxn },
        ],
      });
    } else {
      onChange({ pm_packages: value.pm_packages.filter((p) => p.tier !== tier) });
    }
  };

  return (
    <div className="rounded-2xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 space-y-4">
      <div>
        <p className="text-xs font-bold text-[#065F46]">{t.svcTitle}</p>
        <p className="text-[11px] text-[#047857] leading-snug mt-0.5">{t.svcHint}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#065F46] mb-2">{t.subs}</p>
        <div className="flex flex-col gap-2">
          {PM_SUB_SERVICES.map((s) => {
            const checked = value.pm_sub_services.includes(s.value);
            return (
              <label
                key={s.value}
                className={`flex items-start gap-3 px-3 py-2 rounded-xl border cursor-pointer bg-white ${
                  checked ? "border-[#1B4332]" : "border-[#E5E0D8]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSub(s.value)}
                  className="accent-[#1B4332] mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium text-[#1C1917] block">{s[lang]}</span>
                  <span className="text-[11px] text-[#6B7280] leading-snug">
                    {lang === "es" ? s.esDesc : s.enDesc}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#065F46] mb-2">{t.types}</p>
        <div className="flex flex-col gap-2">
          {PM_PROPERTY_TYPES.map((p) => {
            const checked = value.pm_property_types.includes(p.value);
            return (
              <label
                key={p.value}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer bg-white ${
                  checked ? "border-[#1B4332]" : "border-[#E5E0D8]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleType(p.value)}
                  className="accent-[#1B4332]"
                />
                <span className="text-sm">{p[lang]}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="space-y-3">
        {PM_PACKAGE_TIERS.map((tier) => {
          const pkg = value.pm_packages.find((p) => p.tier === tier.value);
          const enabled = !!pkg;
          return (
            <div key={tier.value} className="rounded-xl border border-[#E5E0D8] bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#1C1917] mb-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => ensurePackage(tier.value, e.target.checked)}
                  className="accent-[#1B4332]"
                />
                {tier[lang]}
              </label>
              {enabled && pkg && (
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[6rem]">
                    <label className="text-[10px] text-[#6B7280]">{t.pkgFrom}</label>
                    <input
                      type="number"
                      value={pkg.from_mxn || ""}
                      onChange={(e) => patchPackage(tier.value, "from_mxn", e.target.value)}
                      className="w-full border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[6rem]">
                    <label className="text-[10px] text-[#6B7280]">{t.pkgTo}</label>
                    <input
                      type="number"
                      value={pkg.to_mxn || ""}
                      onChange={(e) => patchPackage(tier.value, "to_mxn", e.target.value)}
                      className="w-full border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <span className="text-[10px] text-[#6B7280] pb-2">{t.perMo}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#065F46] mb-1">{t.maxProps}</label>
        <input
          type="number"
          min={1}
          value={value.max_properties}
          onChange={(e) => onChange({ max_properties: e.target.value })}
          className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1B4332]"
        />
      </div>
    </div>
  );
}
