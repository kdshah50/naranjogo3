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
    title: "Términos de uso",
    p1:
      "Al usar Tianguis aceptas utilizar el servicio de buena fe: publicar información veraz en los anuncios, respetar a compradores y vendedores, y no emplear la plataforma para actividades ilícitas, spam o fraude. Las transacciones entre usuarios son acuerdos entre ustedes; la plataforma facilita el contacto y, cuando aplique, pagos a través de proveedores terceros (p. ej. procesadores de pago).",
    p2:
      "Podemos suspender cuentas o contenido que viole estos términos o ponga en riesgo a la comunidad. Nos reservamos el derecho de modificar el servicio y de actualizar estas condiciones, publicando la versión vigente en este sitio.",
    disclaimer:
      "Este texto es informativo y no constituye asesoría legal. Ajusta el contenido con un abogado según tu operación.",
  },
  en: {
    back: "← Home",
    title: "Terms of use",
    p1:
      "By using Tianguis you agree to use the service in good faith: truthful listings, respect for buyers and sellers, and no illegal activity, spam, or fraud. Transactions between users are between you; the platform facilitates contact and, where applicable, payments through third-party providers (e.g. payment processors).",
    p2:
      "We may suspend accounts or content that violates these terms or harms the community. We may change the service and update these terms, posting the current version on this site.",
    disclaimer:
      "This text is informational and not legal advice. Have counsel review it for your operation.",
  },
};

export default function TermsClient() {
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
