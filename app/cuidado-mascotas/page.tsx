import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  localizeServiceMenuForProvider,
  petCareLandingSampleMenu,
  serviceMenuItemLabel,
  sortedServiceMenuItems,
} from "@/lib/listing-service-menu";
import {
  DOG_GROOMING_SERVICE,
  PET_SITTING_SERVICE,
  PET_WALKING_SERVICE,
} from "@/lib/provider-services";
import { resolveAppLang, intlLocale, type Lang } from "@/lib/i18n-lang";

const COPY: Record<
  Lang,
  {
    navHome: string;
    heroEyebrow: string;
    heroTitle: string;
    heroSub: string;
    ctaWalk: string;
    ctaSit: string;
    ctaGroom: string;
    ctaSecondary: string;
    badgeFree: string;
    badgeVerified: string;
    badgeReach: string;
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
    menuTitle: string;
    menuSub: string;
    menuNote: string;
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
    buyerCta: string;
    footerNote: string;
    langToggleEs: string;
    langToggleEn: string;
  }
> = {
  es: {
    navHome: "← Inicio",
    heroEyebrow: "Para paseadores, cuidadores y estética canina",
    heroTitle: "Consigue más clientes de cuidado de mascotas en San Miguel.",
    heroSub:
      "Registro gratis en Naranjogo — menú de precios fijos, solicitud con datos de contacto, cotización oficial en el chat y cobro seguro en la app.",
    ctaWalk: "Registrarme como paseador",
    ctaSit: "Registrarme pet sitting",
    ctaGroom: "Registrarme estética canina",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Dueños locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que cuidadores de mascotas en SMA ya están en Naranjogo.",
    why1Title: "Más reservas sin anuncios caros",
    why1Body:
      "Familias y expatriados te encuentran cuando buscan paseos, hospedaje o estética para sus perros y gatos en su colonia.",
    why2Title: "Cobros seguros en la app",
    why2Body:
      "El cliente paga en línea. Menos cobros en efectivo sin registro y cada reserva queda documentada.",
    why3Title: "Menú claro y cotización en chat",
    why3Body:
      "Publicas precios de referencia por paseo, visita o baño. El cliente envía su solicitud con dirección y horario; tú envías la cotización oficial.",
    howTitle: "Cómo funciona",
    how1Title: "1. Elige tu servicio y regístrate",
    how1Body: "Paseador, pet sitting o estética canina — formulario corto con WhatsApp y colonia.",
    how2Title: "2. Cargas tu menú de precios",
    how2Body: "Plantilla sugerida según tu rubro. Ajustas duración, tamaños de perro y extras.",
    how3Title: "3. Te aprobamos en 24 h",
    how3Body: "Revisamos tu perfil y te avisamos por WhatsApp. Luego apareces en el directorio.",
    how4Title: "4. Atiendes y cobras",
    how4Body:
      "El dueño solicita cotización en el chat (con nombre, teléfono y dirección), acepta tu presupuesto, paga el depósito y coordinan la visita.",
    menuTitle: "Ejemplo de menú (precios de referencia)",
    menuSub:
      "Muestra de paseos, visitas y estética. Al registrarte cargamos la plantilla de tu rubro — editas cada precio.",
    menuNote: "El precio puede variar según mascota, distancia y condición — se confirma en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. El registro es gratuito. Naranjogo cobra comisión solo cuando recibes un pago en línea.",
    faq2Q: "¿Puedo ofrecer más de un servicio?",
    faq2A: "Regístrate con tu servicio principal. Puedes indicar otros servicios en tu perfil o crear anuncios adicionales.",
    faq3Q: "¿Cómo funciona la cotización?",
    faq3A:
      "El cliente elige servicios del menú, deja sus datos de contacto y envía la solicitud. Tú revisas, ajustas si hace falta y envías la cotización oficial. El cliente acepta y paga el depósito.",
    faq4Q: "¿Cómo recibo el pago?",
    faq4A: "El cliente paga en la app. Tu pago se deposita a tu cuenta bancaria mexicana (CLABE) al confirmar el servicio.",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes que abren chat en la app pueden contactarte.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Elige paseador, pet sitting o estética canina y carga tu menú con precios de referencia.",
    buyerEyebrow: "¿Buscas cuidado para tu mascota?",
    buyerTitle: "Encuentra paseadores y cuidadores cerca de ti.",
    buyerSub: "Mira proveedores aprobados en San Miguel con menú y precios claros.",
    buyerCta: "Buscar cuidado de mascotas",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For dog walkers, pet sitters, and groomers",
    heroTitle: "Get more pet care clients in San Miguel.",
    heroSub:
      "Free signup on Naranjogo — fixed-price menu, contact details on quote request, official quote in chat, and secure in-app payment.",
    ctaWalk: "Sign up as dog walker",
    ctaSit: "Sign up for pet sitting",
    ctaGroom: "Sign up for dog grooming",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local pet owners",
    whyTitle: "Why join?",
    whySub: "Three reasons pet care providers in SMA are on Naranjogo.",
    why1Title: "More bookings, less ad spend",
    why1Body:
      "Families and expats find you when they need walks, boarding, or grooming for dogs and cats in their neighborhood.",
    why2Title: "Secure in-app payments",
    why2Body: "Customers pay online. Less unrecorded cash and every booking is documented.",
    why3Title: "Clear menu and chat quotes",
    why3Body:
      "Publish reference prices per walk, visit, or groom. The client sends a request with address and time; you send the official quote.",
    howTitle: "How it works",
    how1Title: "1. Pick your service and sign up",
    how1Body: "Dog walking, pet sitting, or grooming — short form with WhatsApp and neighborhood.",
    how2Title: "2. Load your price menu",
    how2Body: "Suggested template for your vertical. Adjust duration, dog sizes, and add-ons.",
    how3Title: "3. We approve you within 24h",
    how3Body: "Manual profile review and WhatsApp ping. Then you appear in the directory.",
    how4Title: "4. You serve and get paid",
    how4Body:
      "The owner requests a quote in chat (name, phone, address), accepts your quote, pays the deposit, and you coordinate the visit.",
    menuTitle: "Sample menu (reference prices)",
    menuSub:
      "Sample walks, visits, and grooming. At signup we load the template for your vertical — edit every price.",
    menuNote: "Price may vary by pet, distance, and condition — confirmed on each quote.",
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A: "Nothing. Signup is free. Naranjogo only takes a commission when you receive an in-app payment.",
    faq2Q: "Can I offer more than one service?",
    faq2A: "Sign up with your primary service. You can note additional services on your profile or create extra listings.",
    faq3Q: "How does quoting work?",
    faq3A:
      "The client picks menu items, leaves contact details, and sends the request. You review, adjust if needed, and send the official quote. They accept and pay the deposit.",
    faq4Q: "How do I get paid?",
    faq4A: "The customer pays in the app. Your share is deposited to your Mexican bank account (CLABE) when you confirm service.",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only customers who open a chat in the app can contact you.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "Choose dog walking, pet sitting, or grooming and load your reference menu.",
    buyerEyebrow: "Need pet care?",
    buyerTitle: "Find walkers and sitters near you.",
    buyerSub: "Browse approved pet care listings in San Miguel with clear menus and prices.",
    buyerCta: "Search pet care",
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
  const lang = resolveAppLang(searchParams?.lang, cookies().get("naranjo_lang")?.value);
  const t = COPY[lang];
  const title =
    lang === "es"
      ? "Cuidado de mascotas en San Miguel de Allende | Naranjogo"
      : "Pet care in San Miguel de Allende | Naranjogo";
  return {
    title,
    description: t.heroSub,
    openGraph: {
      title,
      description: t.heroSub,
      type: "website",
    },
  };
}

export default function CuidadoMascotasLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = resolveAppLang(searchParams?.lang, cookies().get("naranjo_lang")?.value);
  const t = COPY[lang];
  const menu = localizeServiceMenuForProvider(petCareLandingSampleMenu(), PET_WALKING_SERVICE);
  const peso = new Intl.NumberFormat(intlLocale(lang), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const walkHref = `/unete?service=${PET_WALKING_SERVICE}&lang=${lang}`;
  const sitHref = `/unete?service=${PET_SITTING_SERVICE}&lang=${lang}`;
  const groomHref = `/unete?service=${DOG_GROOMING_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "paseador mascotas" : "dog walker pet sitting",
  )}&lang=${lang}`;

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
              href={`/cuidado-mascotas?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#0D9488] uppercase tracking-wider mb-3">
            {t.heroEyebrow}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1B4332] leading-tight mb-4">
            {t.heroTitle}
          </h1>
          <p className="text-sm sm:text-base text-[#374151] leading-relaxed max-w-xl mx-auto mb-6">
            {t.heroSub}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">
            {[t.badgeFree, t.badgeVerified, t.badgeReach].map((b) => (
              <span
                key={b}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]"
              >
                ✓ {b}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 justify-center items-stretch sm:items-center max-w-md mx-auto mb-3">
            <Link
              href={walkHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#1B4332] text-white text-sm font-bold hover:bg-[#2D6A4F] transition-colors"
            >
              🐕 {t.ctaWalk} →
            </Link>
            <Link
              href={sitHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#1B4332] transition-colors"
            >
              🏠 {t.ctaSit} →
            </Link>
            <Link
              href={groomHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0D9488] text-white text-sm font-bold hover:bg-[#0F766E] transition-colors"
            >
              ✂️ {t.ctaGroom} →
            </Link>
          </div>
          <Link
            href="#como-funciona"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-[#1B4332] text-[#1B4332] text-sm font-bold hover:bg-[#ECFDF5] transition-colors"
          >
            {t.ctaSecondary}
          </Link>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2 text-center">
            {t.whyTitle}
          </h2>
          <p className="text-sm text-[#6B7280] mb-6 text-center max-w-lg mx-auto">{t.whySub}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { i: "🐕", t: t.why1Title, b: t.why1Body },
              { i: "💳", t: t.why2Title, b: t.why2Body },
              { i: "📋", t: t.why3Title, b: t.why3Body },
            ].map((c) => (
              <div key={c.t} className="bg-white rounded-2xl border border-[#E5E0D8] p-5">
                <div className="text-3xl mb-3">{c.i}</div>
                <h3 className="font-bold text-sm text-[#1B4332] mb-2">{c.t}</h3>
                <p className="text-xs text-[#374151] leading-relaxed">{c.b}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mb-12 scroll-mt-6">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-6 text-center">
            {t.howTitle}
          </h2>
          <div className="space-y-3">
            {[
              { t: t.how1Title, b: t.how1Body },
              { t: t.how2Title, b: t.how2Body },
              { t: t.how3Title, b: t.how3Body },
              { t: t.how4Title, b: t.how4Body },
            ].map((s) => (
              <div key={s.t} className="bg-white rounded-2xl border border-[#E5E0D8] p-5">
                <h3 className="font-bold text-sm text-[#1B4332] mb-1.5">{s.t}</h3>
                <p className="text-sm text-[#374151] leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#78350F] mb-2">{t.menuTitle}</h2>
            <p className="text-sm text-[#92400E] leading-relaxed mb-5">{t.menuSub}</p>
            <ul className="divide-y divide-amber-200">
              {sortedServiceMenuItems(menu, lang).map((it) => (
                <li key={it.sku} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#1C1917] pr-3 min-w-0">
                    {serviceMenuItemLabel(it, lang)}
                  </span>
                  <span className="text-[#78350F] font-bold tabular-nums shrink-0">
                    {it.price_mxn_cents > 0 ? peso.format(it.price_mxn_cents / 100) : lang === "en" ? "Included" : "Incluido"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs italic text-[#92400E] mt-4 leading-snug">⚠ {t.menuNote}</p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-6 text-center">
            {t.faqTitle}
          </h2>
          <div className="space-y-3">
            {[
              { q: t.faq1Q, a: t.faq1A },
              { q: t.faq2Q, a: t.faq2A },
              { q: t.faq3Q, a: t.faq3A },
              { q: t.faq4Q, a: t.faq4A },
              { q: t.faq5Q, a: t.faq5A },
            ].map((f) => (
              <details
                key={f.q}
                className="bg-white rounded-2xl border border-[#E5E0D8] p-5 group"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-bold text-sm text-[#1B4332]">
                  <span>{f.q}</span>
                  <span className="text-[#6B7280] text-lg group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="text-sm text-[#374151] leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <div className="bg-[#1B4332] rounded-3xl p-8 text-center text-white">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-3">{t.finalTitle}</h2>
            <p className="text-sm sm:text-base text-[#D1FAE5] mb-6 max-w-md mx-auto leading-relaxed">
              {t.finalSub}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href={walkHref}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-[#1B4332] text-sm font-bold hover:bg-[#ECFDF5] transition-colors"
              >
                {t.ctaWalk} →
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-6 text-center">
            <p className="text-xs font-bold text-[#0D9488] uppercase tracking-wider mb-2">
              {t.buyerEyebrow}
            </p>
            <h2 className="font-serif text-xl font-bold text-[#1B4332] mb-2">{t.buyerTitle}</h2>
            <p className="text-sm text-[#6B7280] mb-4 leading-relaxed max-w-md mx-auto">
              {t.buyerSub}
            </p>
            <Link
              href={browseHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#1B4332] hover:underline"
            >
              {t.buyerCta} →
            </Link>
          </div>
        </section>

        <footer className="text-center text-xs text-[#A8A095] py-6">{t.footerNote}</footer>
      </div>
    </main>
  );
}
