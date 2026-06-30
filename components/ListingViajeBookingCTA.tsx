import Link from "next/link";
import type { Lang } from "@/lib/i18n-lang";

/** Single booking path for taxi listings when RIDES_ENABLED — /viaje + /conductor/viajes. */
export default function ListingViajeBookingCTA({ lang = "es" }: { lang?: Lang }) {
  const viajeHref = lang === "en" ? "/viaje?lang=en" : "/viaje";
  const saldoHref = lang === "en" ? "/saldo?lang=en" : "/saldo";
  const t =
    lang === "en"
      ? {
          title: "Book a ride",
          lead: "All taxi trips on Naranjogo use the live dispatch flow — same as Uber/DiDi.",
          step1: "Load prepaid balance at",
          step2: "Request pickup & drop-off (colonia or address)",
          step3: "Your driver accepts on",
          step3suffix: "and completes Accept → Arrive → Start → Complete",
          cta: "Request a ride now",
          saldo: "Load balance first",
          note: "Reference fares in the menu above are estimates. The live fare is calculated on /viaje.",
        }
      : {
          title: "Pedir un viaje",
          lead: "Todos los viajes de taxi en Naranjogo usan el flujo en vivo — igual que Uber/DiDi.",
          step1: "Carga saldo prepago en",
          step2: "Elige origen y destino (colonia o dirección)",
          step3: "Tu conductor acepta en",
          step3suffix: "y completa Aceptar → Llegué → Iniciar → Completar",
          cta: "Pedir viaje ahora",
          saldo: "Cargar saldo primero",
          note: "Las tarifas del menú arriba son referencia. La tarifa en vivo se calcula en /viaje.",
        };

  return (
    <div className="rounded-2xl border-2 border-[#1B4332]/25 bg-white shadow-sm overflow-hidden">
      <div className="bg-[#1B4332] px-4 py-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span aria-hidden>🚕</span> {t.title}
        </h2>
        <p className="text-xs text-white/85 mt-1 leading-relaxed">{t.lead}</p>
      </div>
      <div className="px-4 py-4 space-y-3">
        <ol className="text-sm text-[#1C1917] space-y-2 list-decimal list-inside leading-relaxed">
          <li>
            {t.step1}{" "}
            <Link href={saldoHref} className="font-semibold text-[#1B4332] underline">
              /saldo
            </Link>
          </li>
          <li>{t.step2}</li>
          <li>
            {t.step3}{" "}
            <Link href="/conductor/viajes" className="font-semibold text-[#1B4332] underline">
              /conductor/viajes
            </Link>{" "}
            {t.step3suffix}
          </li>
        </ol>
        <p className="text-[11px] text-[#6B7280] leading-relaxed">{t.note}</p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Link
            href={viajeHref}
            className="flex-1 text-center rounded-xl bg-[#1B4332] text-white font-bold text-sm py-3 px-4 hover:brightness-110"
          >
            {t.cta}
          </Link>
          <Link
            href={saldoHref}
            className="flex-1 text-center rounded-xl border border-[#1B4332]/30 text-[#1B4332] font-semibold text-sm py-3 px-4 hover:bg-[#F8F4ED]"
          >
            {t.saldo}
          </Link>
        </div>
      </div>
    </div>
  );
}
