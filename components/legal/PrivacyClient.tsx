"use client";

import Link from "next/link";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

const COPY: Record<
  Lang,
  { back: string; title: string; p1: string; p2: string; disclaimer: string }
> = {
  es: {
    back: "← Inicio",
    title: "Aviso de privacidad",
    p1:
      "Tianguis (Naranjogo) recopila y trata datos personales que nos proporcionas al usar el servicio (por ejemplo, teléfono para verificación, mensajes con otros usuarios, y datos de anuncios). Usamos la información para operar el marketplace, la seguridad de las cuentas, y el cumplimiento de obligaciones legales aplicables.",
    p2:
      "Puedes solicitar acceso, rectificación o baja de tus datos de acuerdo con la normativa aplicable en México (por ejemplo, LFPDPPP) contactando al soporte del servicio. Conservamos la información el tiempo necesario para la operación y las obligaciones legales.",
    disclaimer:
      "Este texto es informativo y no constituye asesoría legal. Ajusta el contenido con un abogado según tu operación.",
  },
  en: {
    back: "← Home",
    title: "Privacy notice",
    p1:
      "Tianguis (Naranjogo) collects and processes personal data you provide when using the service (for example, phone for verification, messages with other users, and listing information). We use it to run the marketplace, secure accounts, and meet applicable legal obligations.",
    p2:
      "You may request access, correction, or deletion of your data under applicable law in Mexico (e.g. LFPDPPP) by contacting support. We retain information as long as needed for operations and legal obligations.",
    disclaimer:
      "This text is informational and not legal advice. Have counsel review it for your operation.",
  },
};

export default function PrivacyClient() {
  const lang = useAppLang();
  const t = COPY[lang];

  return (
    <main className="min-h-0 flex-1 bg-[#FDF8F1]">
      <div className="max-w-2xl mx-auto px-4 py-10 pb-16">
        <p className="text-sm text-[#6B7280] mb-2">
          <Link href="/" className="text-[#1B4332] font-semibold hover:underline">
            {t.back}
          </Link>
        </p>
        <h1 className="text-2xl font-serif font-bold text-[#1B4332] mb-6">{t.title}</h1>
        <div className="prose prose-stone max-w-none text-[#1C1917] text-sm space-y-4 leading-relaxed">
          <p>{t.p1}</p>
          <p>{t.p2}</p>
          <p className="text-[#6B7280] text-xs">{t.disclaimer}</p>
        </div>
      </div>
    </main>
  );
}
