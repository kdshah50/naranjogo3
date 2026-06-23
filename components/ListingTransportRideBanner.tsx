import Link from "next/link";
import type { Lang } from "@/lib/i18n-lang";

/** On taxi listings: explain fixed menu vs on-demand dispatch at /viaje. */
export default function ListingTransportRideBanner({ lang = "es" }: { lang?: Lang }) {
  const t =
    lang === "en"
      ? {
          title: "Need an on-demand ride with live fare estimate?",
          body: "Use Request a taxi for colonia-to-colonia trips with automatic driver matching (separate from fixed menu quotes below).",
          cta: "Open ride request (from / to)",
        }
      : {
          title: "¿Necesitas un viaje al momento con tarifa estimada?",
          body: "Usa Pedir taxi para trayectos entre colonias con asignación automática de conductor (aparte de las tarifas fijas del menú abajo).",
          cta: "Abrir solicitud de viaje (origen / destino)",
        };

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-bold text-[#78350F] mb-1">{t.title}</p>
      <p className="text-xs text-[#92400E] leading-relaxed mb-3">{t.body}</p>
      <Link
        href={lang === "en" ? "/viaje?lang=en" : "/viaje"}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B4332] hover:underline"
      >
        🚕 {t.cta} →
      </Link>
    </div>
  );
}
