import type { Metadata } from "next";
import Link from "next/link";
import { BILINGUAL_ERRANDS_SERVICE } from "@/lib/provider-services";
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
    servicesTitle: string;
    servicesSub: string;
    services: string[];
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
    heroEyebrow: "Para mandados bilingües en San Miguel",
    heroTitle: "Ayuda local en español e inglés para residentes y expatriados.",
    heroSub:
      "Registro gratis en Naranjogo — publica qué mandados ofreces, acuerda el precio en el chat y cobra de forma segura en la app.",
    ctaPrimary: "Registrarme como mandadero",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Clientes locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que mandaderos bilingües en SMA ya están en Naranjogo.",
    why1Title: "Más clientes sin anuncios caros",
    why1Body:
      "Expatriados y familias locales te encuentran cuando buscan alguien de confianza que hable español e inglés en su colonia.",
    why2Title: "Cobros seguros en la app",
    why2Body:
      "El cliente paga en línea. Menos efectivo sin registro y cada mandado queda documentado.",
    why3Title: "Precio claro en el chat",
    why3Body:
      "Acuerdas el total antes de salir: compras, trámites, acompañamiento o traducción — sin sorpresas.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body:
      "Formulario corto: nombre, WhatsApp, colonia e idiomas. Indica qué mandados sueles hacer.",
    how2Title: "2. Te aprobamos en 24 h",
    how2Body: "Revisamos tu perfil y te avisamos por WhatsApp. Luego apareces en el directorio.",
    how3Title: "3. El cliente te contacta",
    how3Body:
      "Abre tu anuncio, describe el mandado (dirección, horario, detalles) y acuerdan el precio en el chat.",
    how4Title: "4. Completas y cobras",
    how4Body:
      "Realizas el mandado, confirmas en la app y recibes tu pago en tu cuenta bancaria mexicana (CLABE).",
    servicesTitle: "Ejemplos de mandados que puedes ofrecer",
    servicesSub:
      "Describe en tu anuncio qué haces — estos son los más pedidos en San Miguel de Allende.",
    services: [
      "Compras de despensa o farmacia",
      "Recoger paquetes o documentos",
      "Acompañamiento a citas (médico, banco, trámites)",
      "Traducción básica en sitio",
      "Pagos o filas en oficinas locales",
      "Mandados urgentes el mismo día",
    ],
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. El registro es gratuito. Naranjogo cobra comisión solo cuando recibes un pago en línea.",
    faq2Q: "¿Necesito hablar inglés y español?",
    faq2A:
      "Sí — este programa es para mandaderos bilingües que ayudan a expatriados y familias locales en ambos idiomas.",
    faq3Q: "¿Cómo se fija el precio?",
    faq3A:
      "En el chat acuerdan el total según distancia, tiempo y tipo de mandado antes de que empieces.",
    faq4Q: "¿Cómo recibo el pago?",
    faq4A: "El cliente paga en la app. Tu pago se deposita a tu cuenta bancaria mexicana (CLABE).",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes que abren chat en la app pueden contactarte.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Regístrate, cuéntanos qué mandados haces y empieza a recibir solicitudes en SMA.",
    buyerEyebrow: "¿Necesitas un mandadero bilingüe?",
    buyerTitle: "Encuentra ayuda local cerca de ti.",
    buyerSub: "Mira mandaderos aprobados en San Miguel de Allende con perfil verificado.",
    buyerCta: "Buscar mandados bilingües",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For bilingual errand runners in San Miguel",
    heroTitle: "Local help in Spanish and English for residents and expats.",
    heroSub:
      "Free signup on Naranjogo — list the errands you run, agree on price in chat, and get paid securely in the app.",
    ctaPrimary: "Sign up as an errand runner",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local clients",
    whyTitle: "Why join?",
    whySub: "Three reasons bilingual errand runners in SMA are on Naranjogo.",
    why1Title: "More clients, less ad spend",
    why1Body:
      "Expats and local families find you when they need someone trustworthy who speaks Spanish and English in their neighborhood.",
    why2Title: "Secure in-app payments",
    why2Body: "Customers pay online. Less unrecorded cash and every errand is documented.",
    why3Title: "Clear pricing in chat",
    why3Body:
      "Agree on the total before you go: shopping, paperwork, accompaniment, or translation — no surprises.",
    howTitle: "How it works",
    how1Title: "1. You sign up for free",
    how1Body:
      "Short form: name, WhatsApp, neighborhood, and languages. Describe the errands you usually run.",
    how2Title: "2. We approve you within 24h",
    how2Body: "Manual profile review and WhatsApp ping. Then you appear in the directory.",
    how3Title: "3. The client contacts you",
    how3Body:
      "They open your listing, describe the errand (address, time, details), and you agree on price in chat.",
    how4Title: "4. You complete and get paid",
    how4Body:
      "Run the errand, confirm in the app, and receive payment to your Mexican bank account (CLABE).",
    servicesTitle: "Sample errands you can offer",
    servicesSub: "Describe what you do in your listing — these are the most requested in San Miguel de Allende.",
    services: [
      "Grocery or pharmacy runs",
      "Package or document pickup",
      "Appointment accompaniment (doctor, bank, paperwork)",
      "Basic on-site translation",
      "Payments or queues at local offices",
      "Same-day urgent errands",
    ],
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A: "Nothing. Signup is free. Naranjogo only takes a commission when you receive an in-app payment.",
    faq2Q: "Do I need to speak English and Spanish?",
    faq2A:
      "Yes — this program is for bilingual runners who help expats and local families in both languages.",
    faq3Q: "How is the price set?",
    faq3A:
      "You agree on the total in chat based on distance, time, and errand type before you start.",
    faq4Q: "How do I get paid?",
    faq4A: "The customer pays in the app. Your share is deposited to your Mexican bank account (CLABE).",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only customers who open a chat in the app can contact you.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "Sign up, describe the errands you run, and start receiving requests in SMA.",
    buyerEyebrow: "Need a bilingual errand runner?",
    buyerTitle: "Find local help near you.",
    buyerSub: "Browse approved errand runners in San Miguel de Allende with verified profiles.",
    buyerCta: "Search bilingual errands",
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
      ? "Mandados bilingües en San Miguel de Allende | Naranjogo"
      : "Bilingual errands in San Miguel de Allende | Naranjogo";
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

export default function MandadosBilingueLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=${BILINGUAL_ERRANDS_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "mandados bilingüe" : "bilingual errands",
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
              href={`/mandados-bilingue?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#1D4ED8] uppercase tracking-wider mb-3">
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
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200"
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
              { i: "📋", t: t.why1Title, b: t.why1Body },
              { i: "💳", t: t.why2Title, b: t.why2Body },
              { i: "💬", t: t.why3Title, b: t.why3Body },
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
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#1E3A8A] mb-2">{t.servicesTitle}</h2>
            <p className="text-sm text-[#1E40AF] leading-relaxed mb-5">{t.servicesSub}</p>
            <ul className="space-y-2">
              {t.services.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-sm text-[#1C1917] bg-white/70 rounded-xl px-3 py-2 border border-blue-100"
                >
                  <span className="text-[#1D4ED8]" aria-hidden>
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
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
            <p className="text-xs font-bold text-[#1D4ED8] uppercase tracking-wider mb-2">
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
