import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  housekeepingStarterMenu,
  localizeServiceMenuForProvider,
  serviceMenuItemLabel,
  sortedServiceMenuItems,
} from "@/lib/listing-service-menu";
import { HOUSEKEEPING_SERVICE } from "@/lib/provider-services";
import { resolveAppLang, intlLocale, type Lang } from "@/lib/i18n-lang";

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
    heroEyebrow: "Para empleadas domésticas, equipos de limpieza y servicios a domicilio",
    heroTitle: "Consigue más clientes de limpieza en San Miguel.",
    heroSub:
      "Aparece en Naranjogo con menú de precios por cuarto — estándar o profunda, baños, cocina, lavado de ropa y extras. Presupuesto en el chat y cobro seguro en la app.",
    ctaPrimary: "Registrarme gratis",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Clientes locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que limpiadoras de SMA ya están en Naranjogo.",
    why1Title: "Más reservas sin anuncios caros",
    why1Body:
      "Familias, expatriados y rentas vacacionales te encuentran cuando buscan limpieza estándar, profunda o post-mudanza en su colonia.",
    why2Title: "Cobros seguros en la app",
    why2Body:
      "El cliente paga en línea (tarifa de plataforma o servicio completo con Stripe Connect). Menos cobros en efectivo sin registro.",
    why3Title: "Menú claro por cuarto y servicio",
    why3Body:
      "Publicas precios por visita (recámara, baño, cocina, sala, profunda, lavado). En el chat eliges frecuencia: diario, semanal, 2×/semana o mensual.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body: "Formulario corto: nombre, WhatsApp, colonia y servicios. Unos 5 minutos.",
    how2Title: "2. Cargas tu menú de precios",
    how2Body:
      "Plantilla con 32 servicios por visita (estándar/profunda por cuarto, lavandería, mudanza, etc.). Borras lo que no ofreces y pones tus precios.",
    how3Title: "3. Te aprobamos en 24 h",
    how3Body: "Revisamos tu perfil y te avisamos por WhatsApp. Luego apareces en búsquedas.",
    how4Title: "4. Limpias y cobras",
    how4Body:
      "El cliente te escribe en la app, arman el presupuesto con tu menú, paga en línea, y tú confirmas el servicio.",
    menuTitle: "Ejemplo de menú (precios de referencia)",
    menuSub:
      "Esta plantilla se carga al registrarte. Editas cada precio según tu zona y experiencia. Naranjogo no te impone precios.",
    menuNote:
      "El precio puede variar según el estado del hogar, el tamaño real y el acceso — aparece en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A:
      "Nada. El registro es gratuito. Naranjogo cobra comisión solo cuando recibes un pago en línea — los términos se acuerdan contigo antes de cualquier cobro.",
    faq2Q: "¿Estándar vs limpieza profunda?",
    faq2A:
      "En tu menú publicas ambas por cuarto (recámara, baño, cocina, etc.). En el chat seleccionas cuartos y frecuencia (única, diaria, semanal, 2×/semana, mensual) para calcular el total.",
    faq3Q: "¿Traigo productos de limpieza?",
    faq3A:
      "Tú decides. Puedes incluir «productos incluidos» en tu menú con un cargo, o coordinar que el cliente los tenga listos.",
    faq4Q: "¿Cómo recibo el pago?",
    faq4A:
      "El cliente paga en la app. Puede ser solo la tarifa de Naranjogo o el servicio completo si tienes cobros con Stripe Connect activos.",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes que abren chat en la app pueden contactarte.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Cargamos tu menú con 32 servicios de referencia por visita. Solo ajustas precios y listo.",
    buyerEyebrow: "¿Buscas limpieza?",
    buyerTitle: "Encuentra limpieza del hogar cerca de ti.",
    buyerSub: "Mira proveedores aprobados en San Miguel de Allende, con menú y precios claros.",
    buyerCta: "Ver limpieza en SMA",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For house cleaners, cleaning teams, and on-site services",
    heroTitle: "Get more home cleaning clients in San Miguel.",
    heroSub:
      "List on Naranjogo with a room-based menu — standard or deep clean, bathrooms, kitchen, laundry, and add-ons. Quote in chat and get paid securely in the app.",
    ctaPrimary: "Sign up for free",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local customers",
    whyTitle: "Why join?",
    whySub: "Three reasons cleaners in SMA are already on Naranjogo.",
    why1Title: "More bookings, less ad spend",
    why1Body:
      "Families, expats, and vacation rentals find you when they search for standard, deep, or move-out cleaning in their neighborhood.",
    why2Title: "Secure in-app payments",
    why2Body:
      "Customers pay online (platform fee or full service via Stripe Connect). Less unrecorded cash collection.",
    why3Title: "Clear per-room menu",
    why3Body:
      "Publish per-visit prices (bedroom, bathroom, kitchen, living, deep clean, laundry). In chat, pick frequency: daily, weekly, twice/week, or monthly.",
    howTitle: "How it works",
    how1Title: "1. You sign up for free",
    how1Body: "Short form: name, WhatsApp, neighborhood, services. About 5 minutes.",
    how2Title: "2. You load your price menu",
    how2Body:
      "Template with 32 per-visit services (standard/deep by room, laundry, move-out, etc.). Remove what you don't offer and set your prices.",
    how3Title: "3. We approve you within 24h",
    how3Body: "We review your profile and ping you on WhatsApp. Then you appear in search.",
    how4Title: "4. You clean and get paid",
    how4Body:
      "The client messages you in the app, you build a quote from your menu, they pay online, you confirm service.",
    menuTitle: "Sample menu (reference prices)",
    menuSub:
      "This template loads at signup. Edit every price for your area and experience. Naranjogo doesn't set prices for you.",
    menuNote:
      "Price may vary based on home condition, actual size, and access — shown on every quote.",
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A:
      "Nothing. Signup is free. Naranjogo only takes a commission when you receive an in-app payment — terms are agreed before any charge.",
    faq2Q: "Standard vs deep cleaning?",
    faq2A:
      "You publish both per room (bedroom, bathroom, kitchen, etc.). In chat you pick rooms and frequency (one-time, daily, weekly, twice/week, monthly) to calculate the total.",
    faq3Q: "Do I bring cleaning supplies?",
    faq3A:
      "Your choice. You can add a «supplies included» line in your menu, or coordinate with the client to have products ready.",
    faq4Q: "How do I get paid?",
    faq4A:
      "The customer pays in the app — platform fee only, or full service if you have Stripe Connect payouts enabled.",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only customers who open a chat in the app can contact you.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "We load your menu with 32 per-visit reference services. Just adjust prices and you're done.",
    buyerEyebrow: "Need a cleaner?",
    buyerTitle: "Find home cleaning near you.",
    buyerSub: "Browse approved cleaning providers in San Miguel de Allende with clear menus and prices.",
    buyerCta: "Browse cleaners in SMA",
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
      ? "Limpieza del hogar en San Miguel de Allende | Naranjogo"
      : "House cleaning in San Miguel de Allende | Naranjogo";
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

export default function LimpiezaDelHogarLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = resolveAppLang(searchParams?.lang, cookies().get("naranjo_lang")?.value);
  const t = COPY[lang];
  const menu = localizeServiceMenuForProvider(housekeepingStarterMenu(), HOUSEKEEPING_SERVICE);
  const peso = new Intl.NumberFormat(intlLocale(lang), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=${HOUSEKEEPING_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "limpieza" : "house cleaning",
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
              href={`/limpieza-del-hogar?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#2563EB] uppercase tracking-wider mb-3">
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
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
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
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#1B4332] text-[#1B4332] text-sm font-bold hover:bg-[#ECFDF5] transition-colors w-full sm:w-auto"
            >
              {t.ctaSecondary}
            </Link>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2 text-center">
            {t.whyTitle}
          </h2>
          <p className="text-sm text-[#6B7280] mb-6 text-center max-w-lg mx-auto">{t.whySub}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { i: "🧹", t: t.why1Title, b: t.why1Body },
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
              <div
                key={s.t}
                className="bg-white rounded-2xl border border-[#E5E0D8] p-5 flex gap-4"
              >
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-[#1B4332] mb-1.5">{s.t}</h3>
                  <p className="text-sm text-[#374151] leading-relaxed">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-sky-50 rounded-2xl border border-sky-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#1E40AF] mb-2">{t.menuTitle}</h2>
            <p className="text-sm text-[#1D4ED8] leading-relaxed mb-5">{t.menuSub}</p>
            <ul className="divide-y divide-sky-200">
              {sortedServiceMenuItems(menu, lang).map((it) => (
                <li key={it.sku} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#1C1917] pr-3 min-w-0">
                    {serviceMenuItemLabel(it, lang)}
                  </span>
                  <span className="text-[#1E40AF] font-bold tabular-nums shrink-0">
                    {peso.format(it.price_mxn_cents / 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs italic text-[#1D4ED8] mt-4 leading-snug">⚠ {t.menuNote}</p>
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
            <Link
              href={signupHref}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-[#1B4332] text-sm font-bold hover:bg-[#ECFDF5] transition-colors"
            >
              {t.ctaPrimary} →
            </Link>
          </div>
        </section>

        <section className="mb-8">
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-6 text-center">
            <p className="text-xs font-bold text-[#2563EB] uppercase tracking-wider mb-2">
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
