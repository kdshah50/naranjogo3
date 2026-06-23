import type { Metadata } from "next";
import Link from "next/link";
import { taxiRideShareStarterMenu } from "@/lib/listing-service-menu";
import { TRANSPORT_APP_SERVICE } from "@/lib/provider-services";
import { langFromParam, type Lang } from "@/lib/i18n-lang";

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
    heroEyebrow: "Para conductores y taxis en San Miguel",
    heroTitle: "Publica tus tarifas fijas y recibe solicitudes de viaje.",
    heroSub:
      "Registro gratis en Naranjogo — menú de precios por trayecto, solicitud con dirección de recogida, cotización en el chat y cobro seguro en la app.",
    ctaPrimary: "Registrarme como conductor",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Pasajeros locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que conductores en SMA ya están en Naranjogo.",
    why1Title: "Más viajes sin comisiones ocultas",
    why1Body:
      "Residentes, expatriados y visitantes te encuentran cuando buscan taxi con precio claro en su colonia.",
    why2Title: "Cobros seguros en la app",
    why2Body:
      "El pasajero paga en línea. Menos efectivo sin registro y cada viaje queda documentado.",
    why3Title: "Menú de tarifas fijas",
    why3Body:
      "Publicas trayectos locales, aeropuertos y servicios especiales. El pasajero elige del menú, envía su solicitud y tú confirmas la cotización.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body: "Formulario corto: nombre, WhatsApp, colonia y datos del vehículo. Tarda unos 5 minutos.",
    how2Title: "2. Cargas tu menú de tarifas",
    how2Body:
      "Plantilla con viajes locales, aeropuertos y servicios especiales. Agregas, editas o eliminas filas cuando quieras.",
    how3Title: "3. Te aprobamos en 24 h",
    how3Body: "Revisamos tu perfil y te avisamos por WhatsApp. Luego apareces en el directorio.",
    how4Title: "4. Conduces y cobras",
    how4Body:
      "El pasajero elige un trayecto del menú, deja dirección de recogida y horario, acepta tu cotización y paga el depósito.",
    menuTitle: "Ejemplo de menú (tarifas de referencia)",
    menuSub:
      "Esta plantilla se carga al registrarte. Editas cada precio, agregas filas nuevas o eliminas las que no ofrezcas.",
    menuNote:
      "El precio puede variar por tráfico, horario, paradas extra o espera adicional — se confirma en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. El registro es gratuito. Naranjogo cobra comisión solo cuando recibes un pago en línea.",
    faq2Q: "¿Puedo cambiar mis tarifas?",
    faq2A: "Sí. En tu perfil puedes editar el menú cuando quieras: agregar trayectos, cambiar precios o eliminar servicios.",
    faq3Q: "¿Cómo solicita un pasajero un viaje?",
    faq3A:
      "Abre tu anuncio, elige uno o más trayectos del menú, indica dirección de recogida y horario, y envía la solicitud. Tú revisas y envías la cotización oficial.",
    faq4Q: "¿Cómo recibo el pago?",
    faq4A: "El pasajero paga en la app. Tu pago se deposita a tu cuenta bancaria mexicana (CLABE) al confirmar el viaje.",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes que abren chat en la app pueden contactarte.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Cargamos tu menú con tarifas de referencia para SMA y la región. Solo ajustas precios y listo.",
    buyerEyebrow: "¿Necesitas un taxi?",
    buyerTitle: "Encuentra un conductor cerca de ti.",
    buyerSub: "Mira taxis aprobados en San Miguel de Allende con menú de tarifas fijas.",
    buyerCta: "Ver taxis en SMA",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For drivers and taxis in San Miguel",
    heroTitle: "Publish fixed fares and receive ride requests.",
    heroSub:
      "Free signup on Naranjogo — per-trip price menu, pickup details on each request, quotes in chat, and secure in-app payments.",
    ctaPrimary: "Sign up as a driver",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local riders",
    whyTitle: "Why join?",
    whySub: "Three reasons drivers in SMA are already on Naranjogo.",
    why1Title: "More rides, clear pricing",
    why1Body:
      "Residents, expats, and visitors find you when they want a taxi with upfront fares in their neighborhood.",
    why2Title: "Secure in-app payments",
    why2Body: "Riders pay online. Less undocumented cash and every trip is on record.",
    why3Title: "Fixed-fare menu",
    why3Body:
      "Publish local trips, airport runs, and special services. Riders pick from the menu, send a request, and you confirm the quote.",
    howTitle: "How it works",
    how1Title: "1. You sign up for free",
    how1Body: "Short form: name, WhatsApp, neighborhood, and vehicle details. About 5 minutes.",
    how2Title: "2. You load your fare menu",
    how2Body:
      "Template with local trips, airports, and special services. Add, edit, or delete rows anytime.",
    how3Title: "3. We approve you within 24h",
    how3Body: "Manual profile review and WhatsApp ping. Then you appear in the directory.",
    how4Title: "4. You drive and get paid",
    how4Body:
      "The rider picks a trip from the menu, leaves pickup address and time, accepts your quote, and pays the deposit.",
    menuTitle: "Sample menu (reference fares)",
    menuSub:
      "This template loads at signup. Edit every price, add new rows, or remove trips you do not offer.",
    menuNote:
      "Price may vary with traffic, time of day, extra stops, or additional wait — shown on every quote.",
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A: "Nothing. Signup is free. Naranjogo only takes a commission when you receive an in-app payment.",
    faq2Q: "Can I change my fares?",
    faq2A: "Yes. From your profile you can edit the menu anytime: add trips, change prices, or remove services.",
    faq3Q: "How does a rider request a trip?",
    faq3A:
      "They open your listing, pick one or more menu items, enter pickup address and preferred time, and send the request. You review and send the official quote.",
    faq4Q: "How do I get paid?",
    faq4A: "The rider pays in the app. Your share is deposited to your Mexican bank account (CLABE) when you confirm the ride.",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only customers who open a chat in the app can contact you.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "We load your menu with reference fares for SMA and the region. Just adjust prices and you're done.",
    buyerEyebrow: "Need a taxi?",
    buyerTitle: "Find a driver near you.",
    buyerSub: "Browse approved taxi listings in San Miguel de Allende with fixed-fare menus.",
    buyerCta: "Browse taxis in SMA",
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
      ? "Taxi y transporte en San Miguel de Allende | Naranjogo"
      : "Taxi and ride service in San Miguel de Allende | Naranjogo";
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

export default function TransporteLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const menu = taxiRideShareStarterMenu();
  const peso = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=${TRANSPORT_APP_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "taxi transporte" : "taxi ride",
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
              href={`/transporte?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#CA8A04] uppercase tracking-wider mb-3">
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
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-[#92400E] border border-amber-200"
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
              { i: "🚕", t: t.why1Title, b: t.why1Body },
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
              <div key={s.t} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 flex gap-4">
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-[#1B4332] mb-1.5">{s.t}</h3>
                  <p className="text-sm text-[#374151] leading-relaxed">{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#78350F] mb-2">{t.menuTitle}</h2>
            <p className="text-sm text-[#92400E] leading-relaxed mb-5">{t.menuSub}</p>
            <ul className="divide-y divide-amber-200">
              {menu.items.map((it) => (
                <li key={it.sku} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#1C1917] pr-3 min-w-0">
                    {(lang === "en" && it.name_en) || it.name_es}
                  </span>
                  <span className="text-[#78350F] font-bold tabular-nums shrink-0">
                    {peso.format(it.price_mxn_cents / 100)}
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
            <p className="text-xs font-bold text-[#CA8A04] uppercase tracking-wider mb-2">
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
