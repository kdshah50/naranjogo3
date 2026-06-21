import type { Metadata } from "next";
import Link from "next/link";
import { electricianStarterMenu } from "@/lib/listing-service-menu";
import { ELECTRICIAN_SERVICE } from "@/lib/provider-services";
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
    heroEyebrow: "Para electricistas a domicilio",
    heroTitle: "Consigue más clientes de electricidad en San Miguel.",
    heroSub: "Aparece en Naranjogo con menú de precios de referencia, cotización oficial en el chat y cobro seguro — depósito al aceptar, saldo al terminar el trabajo.",
    ctaPrimary: "Registrarme como electricista",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Expats y familias locales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones para publicar tu servicio de electricista en SMA.",
    why1Title: "Clientes que buscan electricista de verdad",
    why1Body: "Familias y expatriados te encuentran cuando buscan contactos, apagadores, cortocircuitos o revisiones de tablero.",
    why2Title: "Cotización antes de pagar",
    why2Body: "Visitas el domicilio, ajustas el presupuesto en la app y el cliente acepta antes del depósito. Menos sorpresas para ambos.",
    why3Title: "Menú claro + materiales aparte",
    why3Body: "Publicas precios de referencia por trabajo. Materiales y piezas se confirman en visita — el total final va en la cotización oficial.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body: "Nombre, WhatsApp, colonia y menú de servicios. Unos 5 minutos.",
    how2Title: "2. Cargas tu menú",
    how2Body: "Plantilla con 16 trabajos típicos (contactos, apagadores, cortocircuitos, ventiladores, tablero, etc.). Ajustas precios a tu zona.",
    how3Title: "3. Te aprobamos",
    how3Body: "Revisamos tu perfil y te avisamos por WhatsApp. Luego apareces en búsquedas.",
    how4Title: "4. Visitas, cotizas y cobras",
    how4Body: "El cliente solicita en el chat, tú inspeccionas, envías cotización oficial, él acepta y paga depósito. Al completar, cobras el saldo en la app.",
    menuTitle: "Ejemplo de menú (precios de referencia)",
    menuSub: "Se carga al registrarte. Editas cada precio. Naranjogo no fija tus tarifas.",
    menuNote: "El precio puede ajustarse después de la visita al domicilio y según materiales necesarios — aparece en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. Solo comisión cuando recibes pago en la app.",
    faq2Q: "¿Incluye materiales?",
    faq2A: "El menú es mano de obra / referencia. Materiales se cotizan en la visita y van en tu presupuesto oficial.",
    faq3Q: "¿Cómo recibo el pago?",
    faq3A: "Depósito al aceptar la cotización; saldo restante al marcar el trabajo completado (Stripe Connect a tu CLABE).",
    faq4Q: "¿Y si el trabajo es más grande al ver la casa?",
    faq4A: "Ajustas líneas y total en el chat antes de que el cliente acepte. Puede rechazar y pedir revisión.",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes con chat en la app.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Menú de referencia listo — solo ajusta precios y publica.",
    buyerEyebrow: "¿Buscas electricista?",
    buyerTitle: "Encuentra electricistas cerca de ti.",
    buyerSub: "Electricistas verificados en San Miguel con menú y cotización en la app.",
    buyerCta: "Ver electricistas en SMA",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For electricians and mobile electrical service",
    heroTitle: "Get more electrical clients in San Miguel.",
    heroSub: "List on Naranjogo with a reference price menu, official chat quotes, and secure pay — deposit on accept, balance when the job is done.",
    ctaPrimary: "Sign up as an electrician",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Expats & local families",
    whyTitle: "Why join?",
    whySub: "Three reasons to list your electrician service in SMA.",
    why1Title: "Customers searching for real electricians",
    why1Body: "Families and expats find you for outlets, switches, short circuits, and panel checks in their neighborhood.",
    why2Title: "Quote before payment",
    why2Body: "Visit the home, adjust the quote in the app, and the customer accepts before paying deposit.",
    why3Title: "Clear menu + materials separate",
    why3Body: "Publish reference labor prices. Parts and materials are confirmed on site — final total in the official quote.",
    howTitle: "How it works",
    how1Title: "1. Sign up free",
    how1Body: "Name, WhatsApp, neighborhood, and service menu. About 5 minutes.",
    how2Title: "2. Load your menu",
    how2Body: "Template with 16 typical jobs (outlets, switches, short circuits, fans, panel checks, etc.). Adjust for your area.",
    how3Title: "3. We approve you",
    how3Body: "Profile review and WhatsApp notice. Then you appear in search.",
    how4Title: "4. Visit, quote, get paid",
    how4Body: "Customer requests in chat, you inspect, send official quote, they accept and pay deposit. Balance in-app when complete.",
    menuTitle: "Sample menu (reference prices)",
    menuSub: "Loads at signup. Edit every price. Naranjogo doesn't set your rates.",
    menuNote: "Price may change after on-site visit and required materials — shown on every quote.",
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A: "Nothing. Commission only when you receive in-app payment.",
    faq2Q: "Are materials included?",
    faq2A: "Menu is labor/reference. Materials are quoted on visit and included in your official quote.",
    faq3Q: "How do I get paid?",
    faq3A: "Deposit when quote is accepted; remaining balance when job is marked complete (Stripe Connect to your CLABE).",
    faq4Q: "What if the job is bigger once I see the home?",
    faq4A: "Adjust lines and total in chat before the customer accepts.",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only in-app chat customers.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "Reference menu ready — adjust prices and publish.",
    buyerEyebrow: "Need an electrician?",
    buyerTitle: "Find electricians near you.",
    buyerSub: "Verified electricians in San Miguel with in-app quotes.",
    buyerCta: "Browse electricians in SMA",
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
      ? "Electricista en San Miguel de Allende | Naranjogo"
      : "Electrician services in San Miguel de Allende | Naranjogo";
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

export default function ElectricistaLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const menu = electricianStarterMenu();
  const peso = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=${ELECTRICIAN_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "electricista" : "electrician",
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
              href={`/electricista?lang=${otherLang}`}
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
              { i: "🐾", t: t.why1Title, b: t.why1Body },
              { i: "💳", t: t.why2Title, b: t.why2Body },
              { i: "📋", t: t.why3Title, b: t.why3Body },
            ].map((c) => (
              <div
                key={c.t}
                className="bg-white rounded-2xl border border-[#E5E0D8] p-5"
              >
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
          <div className="bg-teal-50 rounded-2xl border border-teal-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#065F46] mb-2">
              {t.menuTitle}
            </h2>
            <p className="text-sm text-[#047857] leading-relaxed mb-5">{t.menuSub}</p>
            <ul className="divide-y divide-teal-200">
              {menu.items.map((it) => (
                <li
                  key={it.sku}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-[#1C1917] pr-3 min-w-0">
                    {(lang === "en" && it.name_en) || it.name_es}
                  </span>
                  <span className="text-[#065F46] font-bold tabular-nums shrink-0">
                    {peso.format(it.price_mxn_cents / 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs italic text-[#047857] mt-4 leading-snug">
              ⚠ {t.menuNote}
            </p>
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
            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
              {t.finalTitle}
            </h2>
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
            <p className="text-xs font-bold text-[#0D9488] uppercase tracking-wider mb-2">
              {t.buyerEyebrow}
            </p>
            <h2 className="font-serif text-xl font-bold text-[#1B4332] mb-2">
              {t.buyerTitle}
            </h2>
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

        <footer className="text-center text-xs text-[#A8A095] py-6">
          {t.footerNote}
        </footer>
      </div>
    </main>
  );
}
