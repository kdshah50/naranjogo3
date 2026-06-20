import type { Metadata } from "next";
import Link from "next/link";
import { veterinaryStarterMenu } from "@/lib/listing-service-menu";
import { VETERINARY_SERVICE } from "@/lib/provider-services";
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
    heroEyebrow: "Para clínicas veterinarias y médicos a domicilio",
    heroTitle: "Llega más dueños de mascotas a tu consulta.",
    heroSub: "Aparece en el directorio de Naranjogo en San Miguel de Allende — registro gratis, menú de precios fijos, cobros seguros en la app y presupuestos desde el chat.",
    ctaPrimary: "Registrarme gratis",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Clientes locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que veterinarias de SMA ya están en Naranjogo.",
    why1Title: "Más citas sin publicidad costosa",
    why1Body: "Tu clínica aparece en búsquedas y en el directorio. Familias y expatriados con perros y gatos te encuentran cuando necesitan consulta o vacunas.",
    why2Title: "Cobros seguros en la app",
    why2Body: "El cliente paga en línea con tarjeta u OXXO. Menos efectivo en recepción y cada pago queda registrado para ambos.",
    why3Title: "Menú de servicios con precios claros",
    why3Body: "Publicas consultas, vacunas y procedimientos comunes con precios de referencia. Armas el presupuesto final en el chat según lo que veas en el examen.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body: "Formulario corto: nombre, WhatsApp, colonia y servicios. Tarda unos 5 minutos.",
    how2Title: "2. Cargas tu menú de precios",
    how2Body: "Plantilla con 35 servicios típicos (consulta, vacunas, rayos X, hospitalización, dental, etc.). Ajustas precios a tu clínica.",
    how3Title: "3. Te aprobamos en 24 h",
    how3Body: "Revisamos tu perfil manualmente y te avisamos por WhatsApp. Luego apareces en el directorio.",
    how4Title: "4. Atiendes y cobras",
    how4Body:
      "El dueño solicita cotización en el chat (con datos de contacto), acepta tu presupuesto oficial, paga el depósito y coordinan la cita.",
    menuTitle: "Ejemplo de menú (precios de referencia)",
    menuSub: "Esta plantilla se carga al registrarte. Editas cada precio según tu clínica y zona. Naranjogo no te impone precios.",
    menuNote: "El precio puede ajustarse después del examen físico y según peso, edad o condición del paciente — aparece en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. El registro es gratuito. Naranjogo cobra comisión solo cuando recibes un pago en línea — los términos se acuerdan contigo antes de cualquier cobro.",
    faq2Q: "¿Necesito clínica física?",
    faq2A: "No obligatorio. Puedes ser consulta a domicilio, clínica o mixta. Lo indicas en tu perfil y menú (ej. visita a domicilio).",
    faq3Q: "¿Cómo recibo el pago?",
    faq3A: "El cliente paga en la app. Tu pago se deposita a tu cuenta bancaria mexicana (CLABE) al confirmar el servicio.",
    faq4Q: "¿Y si el caso es más complejo al examinar?",
    faq4A: "Ajustas el presupuesto en el chat antes de cobrar. Cada cotización incluye la nota de que el precio puede cambiar tras el examen físico.",
    faq5Q: "¿Mi WhatsApp es público?",
    faq5A: "No. Solo clientes que abren chat en la app pueden contactarte.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Cargamos tu menú con 35 servicios de referencia. Solo ajustas precios y listo.",
    buyerEyebrow: "¿Buscas veterinaria?",
    buyerTitle: "Encuentra una clínica cerca de ti.",
    buyerSub: "Mira veterinarias aprobadas en San Miguel de Allende, con menú y precios claros.",
    buyerCta: "Ver veterinarias en SMA",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For veterinary clinics and mobile vets",
    heroTitle: "Reach more pet owners from your practice.",
    heroSub: "List on Naranjogo in San Miguel de Allende — free signup, fixed-price service menu, secure in-app payments, and quotes built from chat.",
    ctaPrimary: "Sign up for free",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local customers",
    whyTitle: "Why join?",
    whySub: "Three reasons vets in SMA are already on Naranjogo.",
    why1Title: "More appointments, less ad spend",
    why1Body: "Your clinic shows up in search and the directory. Families and expats with dogs and cats find you when they need exams or vaccines.",
    why2Title: "Secure in-app payments",
    why2Body: "Customers pay online by card or OXXO. Less cash at the front desk and every payment is on record.",
    why3Title: "Clear menu pricing",
    why3Body: "Publish exams, vaccines, and common procedures at reference prices. Final quote in chat reflects what you see on physical exam.",
    howTitle: "How it works",
    how1Title: "1. You sign up for free",
    how1Body: "Short form: name, WhatsApp, neighborhood, services. About 5 minutes.",
    how2Title: "2. You load your price menu",
    how2Body: "Template with 35 typical services (exam, vaccines, X-rays, hospitalization, dental, etc.). Adjust prices for your clinic.",
    how3Title: "3. We approve you within 24h",
    how3Body: "Manual profile review and WhatsApp ping. Then you appear in the directory.",
    how4Title: "4. You treat and get paid",
    how4Body:
      "The owner requests a quote in chat (with contact details), accepts your official quote, pays the deposit, and you coordinate the appointment.",
    menuTitle: "Sample menu (reference prices)",
    menuSub: "This template loads at signup. Edit every price for your clinic and area. Naranjogo doesn't set prices for you.",
    menuNote: "Price may change after physical exam and depending on the patient's weight, age, or condition — shown on every quote.",
    faqTitle: "FAQ",
    faq1Q: "How much does signup cost?",
    faq1A: "Nothing. Signup is free. Naranjogo only takes a commission when you receive an in-app payment — terms are agreed before any charge.",
    faq2Q: "Do I need a physical clinic?",
    faq2A: "Not required. Home visits, clinic, or hybrid — you describe it on your profile and menu (e.g. home visit fee).",
    faq3Q: "How do I get paid?",
    faq3A: "The customer pays in the app. Your share is deposited to your Mexican bank account (CLABE) when you confirm service.",
    faq4Q: "What if the case is more complex after exam?",
    faq4A: "Adjust the quote in chat before charging. Every quote includes the note that price may change after physical exam.",
    faq5Q: "Is my WhatsApp public?",
    faq5A: "No. Only customers who open a chat in the app can contact you.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "We load your menu with 35 reference services. Just adjust prices and you're done.",
    buyerEyebrow: "Need a vet?",
    buyerTitle: "Find a clinic near you.",
    buyerSub: "Browse approved veterinary listings in San Miguel de Allende with clear menus and prices.",
    buyerCta: "Browse vets in SMA",
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
      ? "Servicios veterinarios en San Miguel de Allende | Naranjogo"
      : "Veterinary services in San Miguel de Allende | Naranjogo";
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

export default function VeterinariaLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const menu = veterinaryStarterMenu();
  const peso = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=${VETERINARY_SERVICE}&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "veterinaria" : "veterinary",
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
              href={`/veterinaria?lang=${otherLang}`}
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
