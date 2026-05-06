import Link from "next/link";
import type { Lang } from "@/lib/i18n-lang";
import { withLang } from "@/components/BuyerRetentionPanel";

/**
 * Static reminder (phase D) — nudges multi-visit and reminders without new DB fields.
 */
export default function RoutineHabitsCard({ lang = "es" }: { lang?: Lang }) {
  const t =
    lang === "es"
      ? {
          title: "Haz de Naranjogo tu rutina",
          body: "Las reseñas y la garantía están en la app: reserva de nuevo, usa “Recordarme” para servicios periódicos, y favoritos para volver rápido.",
          cta: "Mis reservas",
          guarantee: "Garantía / reclamo",
          msgs: "Mensajes",
        }
      : {
          title: "Make Naranjogo your routine",
          body: "Reviews and the guarantee live here: rebook trusted providers, use “Remind me” for repeat services, and save favorites.",
          cta: "My bookings",
          guarantee: "Guarantee / claim",
          msgs: "Messages",
        };

  return (
    <div className="bg-gradient-to-br from-[#FEF3C7] to-[#FDF8F1] rounded-2xl border border-amber-200/80 p-5 mb-5">
      <h3 className="font-serif text-base font-bold text-[#1C1917] mb-2">{t.title}</h3>
      <p className="text-sm text-[#6B7280] leading-relaxed mb-3">{t.body}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <Link href={withLang("/my-bookings", lang)} className="text-[#92400E] hover:underline">
          {t.cta} →
        </Link>
        <Link href={withLang("/claims", lang)} className="text-[#92400E] hover:underline">
          {t.guarantee} →
        </Link>
        <Link href={withLang("/messages", lang)} className="text-[#92400E] hover:underline">
          {t.msgs} →
        </Link>
      </div>
    </div>
  );
}
