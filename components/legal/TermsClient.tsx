"use client";

import Link from "next/link";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

type TermsCopy = {
  back: string;
  title: string;
  p1: string;
  p2: string;
  ridesTitle: string;
  ridesIntro: string;
  ridesPlatform: string;
  ridesDrivers: string;
  ridesRisk: string;
  ridesLimitation: string;
  ridesInsurance: string;
  ridesCarveout: string;
  ridesAcceptance: string;
  disclaimer: string;
};

const COPY: Record<Lang, TermsCopy> = {
  es: {
    back: "← Inicio",
    title: "Términos de uso",
    p1:
      "Al usar NaranjoGo (naranjogo.com.mx) aceptas utilizar el servicio de buena fe: publicar información veraz en los anuncios, respetar a compradores y vendedores, y no emplear la plataforma para actividades ilícitas, spam o fraude. Las transacciones entre usuarios son acuerdos entre ustedes; la plataforma facilita el contacto y, cuando aplique, pagos a través de proveedores terceros (p. ej. procesadores de pago).",
    p2:
      "Podemos suspender cuentas o contenido que viole estos términos o ponga en riesgo a la comunidad. Nos reservamos el derecho de modificar el servicio y de actualizar estas condiciones, publicando la versión vigente en este sitio.",
    ridesTitle: "Servicio de viajes (Taxi / Rides)",
    ridesIntro:
      "Las siguientes condiciones aplican cuando solicitas, aceptas o utilizas el servicio de viajes de NaranjoGo. En estos términos, “Mexico Corp” designa a la sociedad afiliada mexicana que opera naranjogo.com.mx, y “US Corp” designa a la sociedad afiliada en los Estados Unidos. Ambas, junto con la marca NaranjoGo y sus filiales, se denominan colectivamente la “Plataforma”. Los nombres societarios exactos podrán sustituirse cuando el asesor legal lo confirme.",
    ridesPlatform:
      "Rol de la Plataforma. NaranjoGo, Mexico Corp y US Corp proporcionan un mercado tecnológico que conecta a pasajeros (“Riders”) con conductores independientes. La Plataforma no es una empresa de transporte, no opera como porteador ni como taxista, y no presta el servicio de traslado. El contrato de transporte, en su caso, se celebra entre el Rider y el conductor.",
    ridesDrivers:
      "Conductores independientes. Los conductores son terceros independientes. No son empleados, socios ni agentes de Mexico Corp, US Corp o NaranjoGo para efectos del viaje. La Plataforma no controla la forma en que el conductor conduce el vehículo, salvo las reglas de uso de la aplicación (por ejemplo, aceptación de viajes o estados del viaje).",
    ridesRisk:
      "Asumción de riesgo. El Rider reconoce que el transporte terrestre conlleva riesgos inherentes, incluyendo accidente, lesión personal, daño a bienes o muerte. Al solicitar o abordar un viaje a través de NaranjoGo, el Rider acepta esos riesgos en la medida permitida por la ley aplicable.",
    ridesLimitation:
      "Limitación de responsabilidad y liberación. En la máxima medida permitida por la legislación aplicable de los Estados Unidos Mexicanos y de los Estados Unidos de América, Mexico Corp, US Corp, NaranjoGo, sus filiales, y sus respectivos directores, funcionarios, empleados y agentes no serán responsables ante el Rider ni ante terceros por incidentes, accidentes, lesiones, daños a la propiedad, pérdidas económicas o muerte que surjan de, o se relacionen con, viajes solicitados, aceptados o realizados mediante la Plataforma, incluyendo actos u omisiones del conductor, del vehículo o de otros usuarios.",
    ridesInsurance:
      "Seguro del conductor como cobertura principal. El seguro de responsabilidad civil automotriz y el seguro de daños materiales / cobertura amplia (o equivalentes) del conductor constituyen la fuente primaria y, en la medida permitida por la ley, exclusiva de cobertura respecto de reclamaciones relacionadas con el vehículo y con los pasajeros durante el viaje. El Rider conviene en dirigir primero cualquier reclamación al conductor y a su aseguradora, y no a Mexico Corp, US Corp ni NaranjoGo, salvo cuando la ley aplicable lo prohíba.",
    ridesCarveout:
      "Límites legales. Nada en esta sección excluye o limita responsabilidad cuando ello esté prohibido por la ley aplicable, ni renuncia a derechos que no puedan renunciarse (incluyendo, cuando corresponda, responsabilidad por dolo o negligencia grave). Si alguna disposición fuera inválida o inaplicable, el resto permanecerá en vigor.",
    ridesAcceptance:
      "Aceptación. Al usar el servicio de viajes de NaranjoGo —incluyendo solicitar un viaje en /viaje o mediante canales vinculados (por ejemplo WhatsApp)— el Rider confirma haber leído y aceptado esta sección. El uso continuado del servicio tras la publicación de actualizaciones constituye aceptación de la versión vigente.",
    disclaimer:
      "Este texto es un borrador informativo para revisión de un abogado y no constituye asesoría legal. Mexico Corp y US Corp son nombres genéricos provisionales; el asesor legal debe confirmar las razones sociales exactas, la ley aplicable y cualquier protección obligatoria al consumidor.",
  },
  en: {
    back: "← Home",
    title: "Terms of use",
    p1:
      "By using NaranjoGo (naranjogo.com.mx) you agree to use the service in good faith: truthful listings, respect for buyers and sellers, and no illegal activity, spam, or fraud. Transactions between users are between you; the platform facilitates contact and, where applicable, payments through third-party providers (e.g. payment processors).",
    p2:
      "We may suspend accounts or content that violates these terms or harms the community. We may change the service and update these terms, posting the current version on this site.",
    ridesTitle: "Ride service (Taxi / Rides)",
    ridesIntro:
      "The following terms apply when you request, accept, or use NaranjoGo’s ride service. In these terms, “Mexico Corp” means the Mexican affiliated company operating naranjogo.com.mx, and “US Corp” means the affiliated company in the United States. Together with the NaranjoGo brand and their affiliates, they are referred to as the “Platform.” Exact legal entity names may be substituted once counsel confirms them.",
    ridesPlatform:
      "Platform role. NaranjoGo, Mexico Corp, and US Corp provide a technology marketplace that connects passengers (“Riders”) with independent drivers. The Platform is not a transportation carrier, does not operate as a taxi company, and does not itself provide the trip. Any transportation arrangement is between the Rider and the driver.",
    ridesDrivers:
      "Independent drivers. Drivers are independent third parties. They are not employees, partners, or agents of Mexico Corp, US Corp, or NaranjoGo for purposes of the trip. The Platform does not control how the driver operates the vehicle, other than application rules (for example, accepting trips or trip status).",
    ridesRisk:
      "Assumption of risk. The Rider acknowledges that ground transportation involves inherent risks, including accident, personal injury, property damage, or death. By requesting or boarding a ride through NaranjoGo, the Rider accepts those risks to the extent permitted by applicable law.",
    ridesLimitation:
      "Limitation of liability and release. To the maximum extent permitted by applicable law of Mexico and of the United States, Mexico Corp, US Corp, NaranjoGo, their affiliates, and their respective directors, officers, employees, and agents shall not be liable to the Rider or to any third party for incidents, accidents, injuries, property damage, economic loss, or death arising out of or relating to rides requested, accepted, or completed through the Platform, including acts or omissions of the driver, the vehicle, or other users.",
    ridesInsurance:
      "Driver insurance as primary coverage. The driver’s automobile liability insurance and comprehensive / collision coverage (or equivalents) are the primary and, to the extent permitted by law, sole source of coverage for claims relating to the vehicle and to riders during the trip. The Rider agrees to look first to the driver and that insurance—not to Mexico Corp, US Corp, or NaranjoGo—except where prohibited by applicable law.",
    ridesCarveout:
      "Legal limits. Nothing in this section excludes or limits liability where prohibited by applicable law, or waives rights that cannot be waived (including, where applicable, liability for willful misconduct or gross negligence). If any provision is held invalid or unenforceable, the remainder shall continue in effect.",
    ridesAcceptance:
      "Acceptance. By using NaranjoGo’s ride service—including requesting a ride on /viaje or through linked channels (for example WhatsApp)—the Rider confirms they have read and accepted this section. Continued use after updates are posted constitutes acceptance of the then-current version.",
    disclaimer:
      "This text is an informational draft for attorney review and is not legal advice. “Mexico Corp” and “US Corp” are provisional generic names; counsel must confirm exact legal entity names, governing law, and any mandatory consumer protections.",
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

          <h2 className="text-lg font-serif font-bold text-[#1B4332] pt-4 !mt-8">
            {t.ridesTitle}
          </h2>
          <p>{t.ridesIntro}</p>
          <p>{t.ridesPlatform}</p>
          <p>{t.ridesDrivers}</p>
          <p>{t.ridesRisk}</p>
          <p>{t.ridesLimitation}</p>
          <p>{t.ridesInsurance}</p>
          <p>{t.ridesCarveout}</p>
          <p>{t.ridesAcceptance}</p>

          <p className="text-[#6B7280] text-xs">{t.disclaimer}</p>
        </div>
      </div>
    </main>
  );
}
