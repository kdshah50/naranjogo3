import {
  formatPmPriceLine,
  parsePropertyManagementProfile,
  pmPackageLabel,
  pmSubServiceLabel,
  type PropertyManagementProfile,
} from "@/lib/property-management";
import type { Lang } from "@/lib/i18n-lang";

type Props = {
  profile: PropertyManagementProfile | null;
  priceMxnCents: number;
  businessName?: string | null;
  lang: Lang;
};

export default function PropertyManagementListingPanel({
  profile,
  priceMxnCents,
  businessName,
  lang,
}: Props) {
  const priceLine = formatPmPriceLine(profile, priceMxnCents, lang);
  const t =
    lang === "es"
      ? {
          consult: "Consulta requerida",
          consultHint:
            "Retainer mensual — no se compra a ciegas. Usa Mensajes en la app con el contexto de tu propiedad.",
          packages: "Paquetes mensuales",
          subs: "Sub-servicios",
          insured: "Asegurado / Fianzado ✓",
          business: "Empresa",
        }
      : {
          consult: "Consultation required",
          consultHint:
            "Monthly retainer — not bought sight-unseen. Use in-app Messages with your property context.",
          packages: "Monthly packages",
          subs: "Sub-services",
          insured: "Insured / Bonded ✓",
          business: "Business",
        };

  return (
    <div className="mb-6 space-y-3">
      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/80 px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900 mb-1">
          {t.consult}
        </p>
        <p className="text-lg font-bold text-[#1B4332]">{priceLine}</p>
        <p className="text-xs text-amber-900/90 mt-2 leading-relaxed">{t.consultHint}</p>
        {businessName ? (
          <p className="text-xs text-[#374151] mt-2">
            <span className="font-semibold">{t.business}:</span> {businessName}
          </p>
        ) : null}
        {profile?.insured_verified ? (
          <span className="inline-block mt-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
            {t.insured}
          </span>
        ) : null}
      </div>

      {profile && profile.packages.length > 0 && (
        <div className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3">
          <p className="text-xs font-bold text-[#1B4332] mb-2">{t.packages}</p>
          <ul className="space-y-1.5">
            {profile.packages.map((p) => (
              <li key={p.tier} className="text-sm text-[#374151] flex justify-between gap-2">
                <span>{pmPackageLabel(p.tier, lang)}</span>
                <span className="font-semibold text-[#1B4332] whitespace-nowrap">
                  ${p.from_mxn.toLocaleString("es-MX")}–${p.to_mxn.toLocaleString("es-MX")}{" "}
                  {lang === "es" ? "/mes" : "/mo"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile && profile.sub_services.length > 0 && (
        <div className="rounded-xl border border-[#E5E0D8] bg-white px-4 py-3">
          <p className="text-xs font-bold text-[#1B4332] mb-2">{t.subs}</p>
          <ul className="flex flex-wrap gap-2">
            {profile.sub_services.map((s) => (
              <li
                key={s}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#F4F0EB] text-[#374151]"
              >
                {pmSubServiceLabel(s, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function resolvePmProfile(raw: unknown): PropertyManagementProfile | null {
  return parsePropertyManagementProfile(raw);
}
