import type { Metadata } from "next";
import Link from "next/link";
import { langFromParam, type Lang } from "@/lib/i18n-lang";
import { PROPERTY_MANAGEMENT_SERVICE, PM_SUB_SERVICES, PM_PACKAGE_TIERS } from "@/lib/property-management";
import PropertyManagementBuyerIntake from "@/components/PropertyManagementBuyerIntake";

const COPY: Record<
  Lang,
  {
    navHome: string;
    heroEyebrow: string;
    heroTitle: string;
    heroSub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    badgeFree: string;
    badgeVetted: string;
    badgeRetainer: string;
    whyTitle: string;
    whySub: string;
    why1Title: string;
    why1Body: string;
    why2Title: string;
    why2Body: string;
    why3Title: string;
    why3Body: string;
    howTitle: string;
    how1Title: string;
    how1Body: string;
    how2Title: string;
    how2Body: string;
    how3Title: string;
    how3Body: string;
    how4Title: string;
    how4Body: string;
    servicesTitle: string;
    servicesSub: string;
    packagesTitle: string;
    packagesSub: string;
    faqTitle: string;
    faq1Q: string;
    faq1A: string;
    faq2Q: string;
    faq2A: string;
    faq3Q: string;
    faq3A: string;
    faq4Q: string;
    faq4A: string;
    faq5Q: string;
    faq5A: string;
    finalTitle: string;
    finalSub: string;
    buyerEyebrow: string;
    buyerTitle: string;
    buyerSub: string;
    footerNote: string;
    langToggleEs: string;
    langToggleEn: string;
  }
> = {
  es: {
    navHome: "← Inicio",
    heroEyebrow: "Para dueños ausentes y administradores en San Miguel",
    heroTitle: "Administración de propiedades con retainer mensual y consulta previa.",
    heroSub:
      "Vigilancia, llaves, pagos de servicios, coordinación de mantenimiento y gestión de rentas — pensado para propietarios extranjeros y locales que no están en SMA todo el año.",
    ctaPrimary: "Registrarme como administrador",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVetted: "Verificación reforzada",
    badgeRetainer: "Precio mensual (no por visita)",
    whyTitle: "¿Por qué este programa?",
    whySub: "No es un mandado de una sola visita: es confianza continua sobre una casa o depto.",
    why1Title: "Dueños ausentes en SMA",
    why1Body:
      "Muchos propietarios viven fuera o viajan. Necesitan alguien local con llaves, seguro y referencias — no solo un precio negociable.",
    why2Title: "Paquetes claros",
    why2Body:
      "Básico / Estándar / Integral con rangos mensuales en MXN. El anuncio muestra “desde $X/mes” y siempre pide consulta.",
    why3Title: "Coordinación de proveedores",
    why3Body:
      "Plomería, jardín, alberca, limpieza y HOA se agendan desde un solo punto de contacto cuando ofreces el paquete integral.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras con datos de confianza",
    how1Body:
      "Razón social, años en SMA, seguro/fianza declarado y 2 referencias de clientes — además de WhatsApp y colonia.",
    how2Title: "2. Revisamos tu perfil",
    how2Body:
      "Aprobación manual antes de publicar. La insignia Asegurado/Fianzado solo aparece tras verificar pruebas.",
    how3Title: "3. El dueño pide consulta",
    how3Body:
      "Completa un intake corto (colonia, tipo, vacía/ocupada, renta o uso personal) y te escribe con ese contexto.",
    how4Title: "4. Acuerdan el retainer",
    how4Body:
      "No hay compra inmediata del retainer en la app. Coordinan alcance y mensualidad; la tarifa de plataforma aplica cuando usen el flujo de pago de Naranjogo.",
    servicesTitle: "Sub-servicios del programa",
    servicesSub: "Elige uno o varios al registrarte — aparecen en tu anuncio.",
    packagesTitle: "Paquetes de referencia (MXN / mes)",
    packagesSub: "Ajustas tus rangos reales en el alta. Estos son puntos de partida típicos en SMA.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Puedo comprar el servicio al instante?",
    faq1A:
      "No. Las fichas de administración de propiedades están marcadas como “Consulta requerida”. Primero hablan y acuerdan el retainer.",
    faq2Q: "¿Qué se verifica del administrador?",
    faq2A:
      "Además del teléfono, pedimos razón social, años en SMA, declaración de seguro/fianza y dos referencias. El equipo puede marcar “Asegurado/Fianzado” tras revisar pruebas.",
    faq3Q: "¿El precio del anuncio es por visita?",
    faq3A:
      "No. Es el inicio del rango mensual (retainer). El filtro de precio del inicio sigue aplicando sobre ese monto mensual.",
    faq4Q: "¿Incluye gestión de Airbnb?",
    faq4A:
      "Si ofreces el sub-servicio de renta/huéspedes: check-in/out, listados y reportes. Puede requerir reglas locales de hospedaje temporal.",
    faq5Q: "¿Cómo me registro?",
    faq5A: "Botón “Registrarme como administrador” → Únete con el servicio preseleccionado.",
    finalTitle: "Publica tu oferta de administración.",
    finalSub: "Registro gratis. Revisión manual. Paquetes mensuales claros para dueños en SMA.",
    buyerEyebrow: "¿Eres dueño de una propiedad en SMA?",
    buyerTitle: "Empieza con un intake corto.",
    buyerSub: "Colonia, tipo de propiedad, ocupada o vacía, y si se renta — luego ves administradores.",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For absentee owners and managers in San Miguel",
    heroTitle: "Property management with monthly retainers and required consultation.",
    heroSub:
      "Property watch, key holding, bill pay, maintenance coordination, and rental management — built for foreign and local owners who aren’t in SMA year-round.",
    ctaPrimary: "Sign up as a property manager",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVetted: "Stronger vetting",
    badgeRetainer: "Monthly price (not per visit)",
    whyTitle: "Why this program?",
    whySub: "Not a one-off job: ongoing trust over someone’s home.",
    why1Title: "Absentee owners in SMA",
    why1Body:
      "Many owners live abroad or travel. They need a local with keys, insurance, and references — not just a negotiable one-time price.",
    why2Title: "Clear packages",
    why2Body:
      "Basic / Standard / Full-Service with monthly MXN ranges. Listings show “from $X/mo” and always require consultation.",
    why3Title: "Vendor coordination",
    why3Body:
      "Plumbing, garden, pool, cleaning, and HOA can sit under one contact when you offer the full-service bundle.",
    howTitle: "How it works",
    how1Title: "1. You sign up with trust fields",
    how1Body:
      "Business name, years in SMA, insurance/bonding declaration, and 2 client references — plus WhatsApp and colonia.",
    how2Title: "2. We review your profile",
    how2Body:
      "Manual approval before publish. The Insured/Bonded badge appears only after proof is verified.",
    how3Title: "3. The owner requests a consultation",
    how3Body:
      "They complete a short intake (colonia, type, vacant/occupied, rental vs personal) and message you with that context.",
    how4Title: "4. You agree the retainer",
    how4Body:
      "No instant retainer checkout. You align scope and monthly fee; platform fees apply when using Naranjogo’s payment flow.",
    servicesTitle: "Program sub-services",
    servicesSub: "Pick one or more at signup — they show on your listing.",
    packagesTitle: "Reference packages (MXN / month)",
    packagesSub: "You set real ranges at signup. These are typical SMA starting points.",
    faqTitle: "FAQ",
    faq1Q: "Can I buy instantly?",
    faq1A:
      "No. Property management listings are marked “Consultation required.” You talk first, then agree the retainer.",
    faq2Q: "What is verified on managers?",
    faq2A:
      "Beyond phone: business name, years in SMA, insurance/bonding declaration, and two references. Staff can mark Insured/Bonded after reviewing proof.",
    faq3Q: "Is the listed price per visit?",
    faq3A:
      "No. It’s the start of the monthly retainer range. The home price slider still filters on that monthly amount.",
    faq4Q: "Does it include Airbnb management?",
    faq4A:
      "If you offer the rental/guest sub-service: check-in/out, listings, and reports. Local short-term rental rules may apply.",
    faq5Q: "How do I sign up?",
    faq5A: "Use “Sign up as a property manager” → Únete with the service preselected.",
    finalTitle: "List your property management offer.",
    finalSub: "Free signup. Manual review. Clear monthly packages for SMA owners.",
    buyerEyebrow: "Own a property in SMA?",
    buyerTitle: "Start with a short intake.",
    buyerSub: "Colonia, property type, occupied or vacant, rental or personal — then browse managers.",
    footerNote: "Naranjogo — local marketplace in San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
};

export function generateMetadata({
  searchParams,
}: {
  searchParams?: { lang?: string };
}): Metadata {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const title =
    lang === "es"
      ? "Administración de propiedades en San Miguel de Allende | Naranjogo"
      : "Property management in San Miguel de Allende | Naranjogo";
  return {
    title,
    description: t.heroSub,
    openGraph: { title, description: t.heroSub, type: "website" },
  };
}

export default function PropertyManagementLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const otherLang: Lang = lang === "es" ? "en" : "es";
  const signupHref = `/unete?service=${PROPERTY_MANAGEMENT_SERVICE}&lang=${lang}`;

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="text-sm text-[#6B7280] hover:text-[#1B4332] transition-colors">
            {t.navHome}
          </Link>
          <div className="flex bg-white rounded-lg p-1 gap-1 border border-[#E5E0D8]">
            <span className="px-3 py-1 rounded-md text-xs font-bold bg-[#1B4332] text-white">
              {lang === "es" ? t.langToggleEs : t.langToggleEn}
            </span>
            <Link
              href={`/administracion-de-propiedades?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#92400E] uppercase tracking-wider mb-3">
            {t.heroEyebrow}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1B4332] leading-tight mb-4">
            {t.heroTitle}
          </h1>
          <p className="text-sm sm:text-base text-[#374151] leading-relaxed max-w-xl mx-auto mb-6">
            {t.heroSub}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {[t.badgeFree, t.badgeVetted, t.badgeRetainer].map((b) => (
              <span
                key={b}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200"
              >
                ✓ {b}
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href={signupHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-bold hover:bg-[#2D6A4F] transition-colors w-full sm:w-auto"
            >
              {t.ctaPrimary} →
            </Link>
            <Link
              href="#como-funciona"
              className="text-sm font-semibold text-[#1B4332] underline underline-offset-2"
            >
              {t.ctaSecondary}
            </Link>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2 text-center">{t.whyTitle}</h2>
          <p className="text-sm text-[#6B7280] text-center mb-6">{t.whySub}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [t.why1Title, t.why1Body],
              [t.why2Title, t.why2Body],
              [t.why3Title, t.why3Body],
            ].map(([title, body]) => (
              <div key={title} className="bg-white rounded-2xl border border-[#E5E0D8] p-4">
                <h3 className="text-sm font-bold text-[#1B4332] mb-2">{title}</h3>
                <p className="text-xs text-[#374151] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mb-12 scroll-mt-8">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-6 text-center">{t.howTitle}</h2>
          <ol className="space-y-4">
            {[
              [t.how1Title, t.how1Body],
              [t.how2Title, t.how2Body],
              [t.how3Title, t.how3Body],
              [t.how4Title, t.how4Body],
            ].map(([title, body]) => (
              <li key={title} className="bg-white rounded-2xl border border-[#E5E0D8] p-4">
                <h3 className="text-sm font-bold text-[#1B4332] mb-1">{title}</h3>
                <p className="text-xs text-[#374151] leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2 text-center">
            {t.servicesTitle}
          </h2>
          <p className="text-sm text-[#6B7280] text-center mb-6">{t.servicesSub}</p>
          <ul className="space-y-3">
            {PM_SUB_SERVICES.map((s) => (
              <li
                key={s.value}
                className="bg-white rounded-2xl border border-[#E5E0D8] px-4 py-3"
              >
                <p className="text-sm font-bold text-[#1B4332]">{s[lang]}</p>
                <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                  {lang === "es" ? s.esDesc : s.enDesc}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2 text-center">
            {t.packagesTitle}
          </h2>
          <p className="text-sm text-[#6B7280] text-center mb-6">{t.packagesSub}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PM_PACKAGE_TIERS.map((p) => (
              <div
                key={p.value}
                className="bg-white rounded-2xl border border-amber-200 p-4 text-center"
              >
                <p className="text-sm font-bold text-amber-950">{p[lang]}</p>
                <p className="text-xs text-[#6B7280] mt-2">
                  ${p.defaultFromMxn.toLocaleString("es-MX")} – $
                  {p.defaultToMxn.toLocaleString("es-MX")}{" "}
                  {lang === "es" ? "MXN/mes" : "MXN/mo"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-4 text-center">{t.faqTitle}</h2>
          <div className="space-y-2">
            {(
              [
                [t.faq1Q, t.faq1A],
                [t.faq2Q, t.faq2A],
                [t.faq3Q, t.faq3A],
                [t.faq4Q, t.faq4A],
                [t.faq5Q, t.faq5A],
              ] as const
            ).map(([q, a]) => (
              <details
                key={q}
                className="bg-white rounded-xl border border-[#E5E0D8] px-4 py-3 group"
              >
                <summary className="text-sm font-semibold text-[#1B4332] cursor-pointer list-none flex justify-between gap-2">
                  {q}
                  <span className="text-[#A8A095] group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-xs text-[#374151] leading-relaxed mt-2 pt-2 border-t border-[#F4F0EB]">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-12 text-center bg-[#1B4332] rounded-3xl px-6 py-10 text-white">
          <h2 className="font-serif text-2xl font-bold mb-2">{t.finalTitle}</h2>
          <p className="text-sm text-white/80 mb-5 max-w-md mx-auto">{t.finalSub}</p>
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#D4A017] text-white text-sm font-bold hover:bg-[#C4900D] transition-colors"
          >
            {t.ctaPrimary} →
          </Link>
        </section>

        <section className="mb-8 text-center">
          <p className="text-xs font-bold text-[#92400E] uppercase tracking-wider mb-2">
            {t.buyerEyebrow}
          </p>
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2">{t.buyerTitle}</h2>
          <p className="text-sm text-[#6B7280] mb-5 max-w-md mx-auto">{t.buyerSub}</p>
          <PropertyManagementBuyerIntake lang={lang} />
        </section>

        <p className="text-center text-xs text-[#A8A095]">{t.footerNote}</p>
      </div>
    </main>
  );
}
