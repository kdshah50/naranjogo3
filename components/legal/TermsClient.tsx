"use client";

import Link from "next/link";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

type TermsCopy = {
  back: string;
  title: string;
  p1: string;
  p2: string;
  defsTitle: string;
  defsBody: string;
  servicesTitle: string;
  servicesScope: string;
  servicesPlatform: string;
  servicesProviders: string;
  servicesLocations: string;
  servicesRisk: string;
  servicesLimitation: string;
  servicesInsurance: string;
  ridesTitle: string;
  ridesExtra: string;
  ridesInsurance: string;
  carveout: string;
  acceptance: string;
  disclaimer: string;
};

const COPY: Record<Lang, TermsCopy> = {
  es: {
    back: "← Inicio",
    title: "Términos de uso",
    p1:
      "Al usar NaranjoGo (naranjogo.com.mx) aceptas utilizar el servicio de buena fe: publicar información veraz en los anuncios, respetar a compradores, vendedores y prestadores, y no emplear la plataforma para actividades ilícitas, spam o fraude. Las transacciones entre usuarios son acuerdos entre ustedes; la plataforma facilita el contacto y, cuando aplique, pagos a través de proveedores terceros (p. ej. procesadores de pago).",
    p2:
      "Podemos suspender cuentas o contenido que viole estos términos o ponga en riesgo a la comunidad. Nos reservamos el derecho de modificar el servicio y de actualizar estas condiciones, publicando la versión vigente en este sitio.",
    defsTitle: "Definiciones",
    defsBody:
      "“Mexico Corp” designa a la sociedad afiliada mexicana que opera naranjogo.com.mx. “US Corp” designa a la sociedad afiliada en los Estados Unidos. Ambas, junto con la marca NaranjoGo y sus filiales, se denominan colectivamente la “Plataforma”. “Cliente” (o “Rider”, en viajes) es quien solicita o contrata un servicio. “Prestador” (incluyendo conductores de taxi) es el tercero independiente que ofrece o realiza el servicio. Los nombres societarios exactos de Mexico Corp y US Corp son provisionales y podrán sustituirse cuando el asesor legal lo confirme.",
    servicesTitle: "Servicios del mercado (todas las categorías)",
    servicesScope:
      "Esta sección aplica a todos los servicios ofrecidos o reservados a través de NaranjoGo, incluyendo las categorías actuales de la plataforma: (1) Limpieza del hogar / housekeeping; (2) Cuidado de mascotas (paseo, pet sitting / hospedaje, estética canina); (3) Servicios veterinarios; (4) Arreglos de ropa / costurería; y (5) Taxi / transporte por aplicación; así como cualquier otra categoría de servicio que NaranjoGo publique o habilite en el futuro.",
    servicesPlatform:
      "Rol de la Plataforma. NaranjoGo, Mexico Corp y US Corp proporcionan un mercado tecnológico que conecta Clientes con Prestadores independientes. La Plataforma no presta por sí misma los servicios profesionales, de cuidado, de limpieza, veterinarios, de costurería ni de transporte; no es empleador del Prestador ni empresa de servicios en el sentido de ejecutar el trabajo contratado. El acuerdo de prestación del servicio se celebra entre el Cliente y el Prestador.",
    servicesProviders:
      "Prestadores independientes. Los Prestadores son terceros independientes. No son empleados, socios ni agentes de Mexico Corp, US Corp o NaranjoGo para efectos de la ejecución del servicio. La Plataforma no controla la forma, calidad técnica ni resultado del trabajo del Prestador, salvo las reglas de uso de la aplicación (por ejemplo, cotizaciones, estados de reserva o pagos).",
    servicesLocations:
      "Lugar del servicio. Los servicios pueden realizarse (a) en el domicilio u otra ubicación del Cliente (“a domicilio” / on-site), o (b) en el local, taller, clínica, estudio u otras instalaciones del Prestador (“en el lugar del Prestador” / in-house). Esta sección aplica por igual a ambos modos de prestación.",
    servicesRisk:
      "Asumción de riesgo. El Cliente reconoce que los servicios —incluyendo trabajo en el hogar, cuidado de personas o mascotas, atención veterinaria, costurería y transporte— conllevan riesgos inherentes de accidente, lesión personal, enfermedad, daño a bienes, pérdida o muerte (de personas o animales, según aplique). Al solicitar, reservar, aceptar o recibir un servicio a través de NaranjoGo, el Cliente acepta esos riesgos en la medida permitida por la ley aplicable.",
    servicesLimitation:
      "Limitación de responsabilidad y liberación. En la máxima medida permitida por la legislación aplicable de los Estados Unidos Mexicanos y de los Estados Unidos de América, Mexico Corp, US Corp, NaranjoGo, sus filiales, y sus respectivos directores, funcionarios, empleados y agentes no serán responsables ante el Cliente, el Prestador ni ante terceros por incidentes, accidentes, lesiones, daños a la propiedad, pérdidas económicas, reclamos de terceros o muerte que surjan de, o se relacionen con, servicios solicitados, cotizados, reservados, aceptados o realizados mediante la Plataforma —ya sea a domicilio o en el lugar del Prestador— incluyendo actos u omisiones del Prestador, de sus empleados o subcontratistas, del Cliente, o de otros usuarios.",
    servicesInsurance:
      "Seguro y responsabilidad del Prestador. El Prestador es el único responsable de contar con las licencias, permisos y seguros aplicables a su actividad (incluyendo, según corresponda, responsabilidad civil, seguro de bienes, cobertura profesional o veterinaria, y cualquier otra póliza exigida por la ley o por la naturaleza del servicio). Dichas coberturas del Prestador constituyen la fuente primaria y, en la medida permitida por la ley, exclusiva respecto de reclamaciones relacionadas con el servicio, los bienes del Cliente, las mascotas, las personas atendidas y las instalaciones involucradas. El Cliente conviene en dirigir primero cualquier reclamación al Prestador y a su aseguradora, y no a Mexico Corp, US Corp ni NaranjoGo, salvo cuando la ley aplicable lo prohíba.",
    ridesTitle: "Términos adicionales — Taxi / transporte por aplicación",
    ridesExtra:
      "Sin perjuicio de lo anterior, cuando el servicio sea un viaje (taxi / rides), la Plataforma no es porteador ni empresa de taxis; el contrato de transporte, en su caso, se celebra entre el Rider y el conductor independiente.",
    ridesInsurance:
      "Seguro del conductor (viajes). El seguro de responsabilidad civil automotriz y el seguro de daños materiales / cobertura amplia (o equivalentes) del conductor constituyen la fuente primaria y, en la medida permitida por la ley, exclusiva de cobertura respecto de reclamaciones relacionadas con el vehículo y con los pasajeros durante el viaje. El Rider conviene en dirigir primero cualquier reclamación al conductor y a su aseguradora, y no a Mexico Corp, US Corp ni NaranjoGo, salvo cuando la ley aplicable lo prohíba.",
    carveout:
      "Límites legales. Nada en estos términos excluye o limita responsabilidad cuando ello esté prohibido por la ley aplicable, ni renuncia a derechos que no puedan renunciarse (incluyendo, cuando corresponda, responsabilidad por dolo o negligencia grave). Si alguna disposición fuera inválida o inaplicable, el resto permanecerá en vigor.",
    acceptance:
      "Aceptación. Al usar NaranjoGo —incluyendo solicitar cotizaciones, reservar servicios, pagar depósitos o saldos, o solicitar un viaje en /viaje o mediante canales vinculados (por ejemplo WhatsApp)— el Cliente confirma haber leído y aceptado estos términos, incluida la sección de servicios del mercado y, cuando aplique, los términos adicionales de taxi. El uso continuado tras la publicación de actualizaciones constituye aceptación de la versión vigente.",
    disclaimer:
      "Este texto es un borrador informativo para revisión de un abogado y no constituye asesoría legal. Mexico Corp y US Corp son nombres genéricos provisionales; el asesor legal debe confirmar las razones sociales exactas, la ley aplicable y cualquier protección obligatoria al consumidor.",
  },
  en: {
    back: "← Home",
    title: "Terms of use",
    p1:
      "By using NaranjoGo (naranjogo.com.mx) you agree to use the service in good faith: truthful listings, respect for buyers, sellers, and providers, and no illegal activity, spam, or fraud. Transactions between users are between you; the platform facilitates contact and, where applicable, payments through third-party providers (e.g. payment processors).",
    p2:
      "We may suspend accounts or content that violates these terms or harms the community. We may change the service and update these terms, posting the current version on this site.",
    defsTitle: "Definitions",
    defsBody:
      "“Mexico Corp” means the Mexican affiliated company operating naranjogo.com.mx. “US Corp” means the affiliated company in the United States. Together with the NaranjoGo brand and their affiliates, they are referred to as the “Platform.” “Customer” (or “Rider,” for trips) means the person who requests or books a service. “Provider” (including taxi drivers) means the independent third party who offers or performs the service. The exact legal names of Mexico Corp and US Corp are provisional and may be substituted once counsel confirms them.",
    servicesTitle: "Marketplace services (all categories)",
    servicesScope:
      "This section applies to all services offered or booked through NaranjoGo, including the platform’s current categories: (1) House cleaning / housekeeping; (2) Pet care (dog walking, pet sitting / boarding, dog grooming); (3) Veterinary services; (4) Clothing alterations / tailoring; and (5) Taxi / ride-hailing; as well as any other service category NaranjoGo publishes or enables in the future.",
    servicesPlatform:
      "Platform role. NaranjoGo, Mexico Corp, and US Corp provide a technology marketplace that connects Customers with independent Providers. The Platform does not itself perform professional, care, cleaning, veterinary, tailoring, or transportation services; it is not the Provider’s employer and is not the company that executes the contracted work. The service arrangement is between the Customer and the Provider.",
    servicesProviders:
      "Independent Providers. Providers are independent third parties. They are not employees, partners, or agents of Mexico Corp, US Corp, or NaranjoGo for purposes of performing the service. The Platform does not control the manner, technical quality, or outcome of the Provider’s work, other than application rules (for example, quotes, booking status, or payments).",
    servicesLocations:
      "Service location. Services may be performed (a) at the Customer’s home or other Customer location (“on-site”), or (b) at the Provider’s shop, workshop, clinic, studio, or other premises (“at the Provider’s place” / in-house). This section applies equally to both modes of delivery.",
    servicesRisk:
      "Assumption of risk. The Customer acknowledges that services—including work in the home, care of people or pets, veterinary care, tailoring, and transportation—involve inherent risks of accident, personal injury, illness, property damage, loss, or death (of persons or animals, as applicable). By requesting, booking, accepting, or receiving a service through NaranjoGo, the Customer accepts those risks to the extent permitted by applicable law.",
    servicesLimitation:
      "Limitation of liability and release. To the maximum extent permitted by applicable law of Mexico and of the United States, Mexico Corp, US Corp, NaranjoGo, their affiliates, and their respective directors, officers, employees, and agents shall not be liable to the Customer, the Provider, or any third party for incidents, accidents, injuries, property damage, economic loss, third-party claims, or death arising out of or relating to services requested, quoted, booked, accepted, or performed through the Platform—whether on-site or at the Provider’s premises—including acts or omissions of the Provider, their employees or subcontractors, the Customer, or other users.",
    servicesInsurance:
      "Provider insurance and responsibility. The Provider is solely responsible for holding any licenses, permits, and insurance applicable to their activity (including, as applicable, general liability, property insurance, professional or veterinary coverage, and any other policy required by law or by the nature of the service). Such Provider coverages are the primary and, to the extent permitted by law, sole source for claims relating to the service, the Customer’s property, pets, persons served, and premises involved. The Customer agrees to look first to the Provider and that insurance—not to Mexico Corp, US Corp, or NaranjoGo—except where prohibited by applicable law.",
    ridesTitle: "Additional terms — Taxi / ride-hailing",
    ridesExtra:
      "Without limiting the foregoing, when the service is a ride (taxi / rides), the Platform is not a carrier or taxi company; any transportation arrangement is between the Rider and the independent driver.",
    ridesInsurance:
      "Driver insurance (rides). The driver’s automobile liability insurance and comprehensive / collision coverage (or equivalents) are the primary and, to the extent permitted by law, sole source of coverage for claims relating to the vehicle and to riders during the trip. The Rider agrees to look first to the driver and that insurance—not to Mexico Corp, US Corp, or NaranjoGo—except where prohibited by applicable law.",
    carveout:
      "Legal limits. Nothing in these terms excludes or limits liability where prohibited by applicable law, or waives rights that cannot be waived (including, where applicable, liability for willful misconduct or gross negligence). If any provision is held invalid or unenforceable, the remainder shall continue in effect.",
    acceptance:
      "Acceptance. By using NaranjoGo—including requesting quotes, booking services, paying deposits or balances, or requesting a ride on /viaje or through linked channels (for example WhatsApp)—the Customer confirms they have read and accepted these terms, including the marketplace services section and, where applicable, the additional taxi terms. Continued use after updates are posted constitutes acceptance of the then-current version.",
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
            {t.defsTitle}
          </h2>
          <p>{t.defsBody}</p>

          <h2 className="text-lg font-serif font-bold text-[#1B4332] pt-4 !mt-8">
            {t.servicesTitle}
          </h2>
          <p>{t.servicesScope}</p>
          <p>{t.servicesPlatform}</p>
          <p>{t.servicesProviders}</p>
          <p>{t.servicesLocations}</p>
          <p>{t.servicesRisk}</p>
          <p>{t.servicesLimitation}</p>
          <p>{t.servicesInsurance}</p>

          <h2 className="text-lg font-serif font-bold text-[#1B4332] pt-4 !mt-8">
            {t.ridesTitle}
          </h2>
          <p>{t.ridesExtra}</p>
          <p>{t.ridesInsurance}</p>

          <p>{t.carveout}</p>
          <p>{t.acceptance}</p>

          <p className="text-[#6B7280] text-xs">{t.disclaimer}</p>
        </div>
      </div>
    </main>
  );
}
