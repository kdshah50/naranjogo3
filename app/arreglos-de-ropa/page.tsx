import type { Metadata } from "next";
import Link from "next/link";
import { tailoringStarterMenu } from "@/lib/listing-service-menu";
import { langFromParam, type Lang } from "@/lib/i18n-lang";

const COPY: Record<Lang, {
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
  why1Title: string; why1Body: string;
  why2Title: string; why2Body: string;
  why3Title: string; why3Body: string;
  howTitle: string;
  how1Title: string; how1Body: string;
  how2Title: string; how2Body: string;
  how3Title: string; how3Body: string;
  how4Title: string; how4Body: string;
  menuTitle: string;
  menuSub: string;
  menuNote: string;
  faqTitle: string;
  faq1Q: string; faq1A: string;
  faq2Q: string; faq2A: string;
  faq3Q: string; faq3A: string;
  faq4Q: string; faq4A: string;
  faq5Q: string; faq5A: string;
  finalTitle: string;
  finalSub: string;
  buyerEyebrow: string;
  buyerTitle: string;
  buyerSub: string;
  buyerCta: string;
  footerNote: string;
  langToggleEs: string;
  langToggleEn: string;
}> = {
  es: {
    navHome: "← Inicio",
    heroEyebrow: "Para costureras, sastres y talleres de arreglos",
    heroTitle: "Convierte tu costura en un negocio digital.",
    heroSub: "Recibe clientes nuevos cada semana en San Miguel de Allende — sin pagar publicidad ni instalar nada nuevo. Tu cliente paga seguro en la app, tú haces el arreglo, te pagamos por transferencia.",
    ctaPrimary: "Registrarme gratis",
    ctaSecondary: "Ver cómo funciona",
    badgeFree: "Registro gratis",
    badgeVerified: "Perfil verificado",
    badgeReach: "Clientes locales reales",
    whyTitle: "¿Por qué unirte?",
    whySub: "Tres razones por las que costureras de SMA ya están en Naranjogo.",
    why1Title: "Más clientes sin esfuerzo de marketing",
    why1Body: "Tu taller aparece en las búsquedas y el directorio del sitio. Familias, expatriados y nuevos vecinos de SMA te encuentran cuando necesitan un arreglo.",
    why2Title: "Cobros seguros en la app",
    why2Body: "El cliente paga en línea con tarjeta u OXXO. Tú no manejas efectivo de personas que no conoces, y el cobro queda registrado para ambos.",
    why3Title: "Menú de precios fijos, sin regateo",
    why3Body: "Publicas tu lista (dobladillo, cierres, parches, etc.) con precios claros. Reduces preguntas repetidas y desacuerdos al recibir la prenda.",
    howTitle: "Cómo funciona",
    how1Title: "1. Te registras gratis",
    how1Body: "Llenas un formulario corto: tu nombre, WhatsApp, colonia y los servicios que ofreces. Tarda 5 minutos.",
    how2Title: "2. Cargas tu menú de precios",
    how2Body: "Te damos una plantilla con los 20 arreglos más comunes y precios de barrio. Cambias o borras lo que quieras.",
    how3Title: "3. Te aprobamos en 24 h",
    how3Body: "Revisamos tu perfil manualmente y te avisamos por WhatsApp. Una vez aprobada, tu taller aparece en el directorio.",
    how4Title: "4. Recibes clientes y cobros",
    how4Body: "El cliente te escribe en la app, arman el presupuesto con tu menú, paga en línea, y tú haces el trabajo. Recibes tu pago al confirmar entrega.",
    menuTitle: "Ejemplo de menú (precios de referencia)",
    menuSub: "Esta es la plantilla que te ofrecemos al registrarte. Puedes editar cada precio según tu zona y tu experiencia. Naranjogo no te impone precios.",
    menuNote: "El precio puede ajustarse al revisar la prenda físicamente — esta nota aparece automáticamente en cada cotización.",
    faqTitle: "Preguntas frecuentes",
    faq1Q: "¿Cuánto cuesta registrarme?",
    faq1A: "Nada. El registro y aparecer en el directorio es gratuito. Naranjogo cobra una comisión por servicio cuando recibes un pago en línea — los términos se acuerdan contigo antes de cualquier cobro.",
    faq2Q: "¿Tengo que tener taller físico?",
    faq2A: "No. Puedes trabajar desde tu casa, recoger prendas a domicilio, o tener taller. En tu perfil indicas cómo trabajas.",
    faq3Q: "¿Cómo recibo el pago?",
    faq3A: "El cliente paga en la app con tarjeta u OXXO. Tu parte del pago se deposita a tu cuenta bancaria mexicana al confirmar que entregaste la prenda. Necesitarás CLABE bancaria.",
    faq4Q: "¿Y si el arreglo es más complicado al verlo?",
    faq4A: "Puedes ajustar el presupuesto antes de empezar a coser. Cada cotización lleva la nota de \"el precio puede ajustarse al revisar la prenda\". El cliente acepta el nuevo monto antes de pagar.",
    faq5Q: "¿Mi número de WhatsApp se muestra públicamente?",
    faq5A: "No. Solo los clientes que abran un chat dentro de la app pueden mandarte mensajes. Tu número personal queda privado.",
    finalTitle: "Empieza hoy. Tarda 5 minutos.",
    finalSub: "Cargamos tu menú con una plantilla de 20 arreglos comunes. Solo ajustas los precios y listo.",
    buyerEyebrow: "¿Necesitas un arreglo?",
    buyerTitle: "Encuentra una costurera cerca de ti.",
    buyerSub: "Mira los talleres aprobados en San Miguel de Allende, con menú y precios claros.",
    buyerCta: "Ver costureras en SMA",
    footerNote: "Naranjogo — mercado local en San Miguel de Allende",
    langToggleEs: "ES",
    langToggleEn: "EN",
  },
  en: {
    navHome: "← Home",
    heroEyebrow: "For tailors, seamstresses, and alteration shops",
    heroTitle: "Turn your tailoring skills into a digital business.",
    heroSub: "Get new customers every week in San Miguel de Allende — no ads, no extra apps to install. Your customer pays securely in the app, you do the work, we pay you by bank transfer.",
    ctaPrimary: "Sign up for free",
    ctaSecondary: "See how it works",
    badgeFree: "Free signup",
    badgeVerified: "Verified profile",
    badgeReach: "Real local customers",
    whyTitle: "Why join?",
    whySub: "Three reasons tailors in SMA are already on Naranjogo.",
    why1Title: "More customers, no marketing work",
    why1Body: "Your shop shows up in search and in the directory. Families, expats, and new neighbors in SMA find you when they need an alteration.",
    why2Title: "Secure in-app payments",
    why2Body: "The customer pays online with card or OXXO. You don't handle cash from strangers, and every payment is on record for both of you.",
    why3Title: "Fixed-price menu, no haggling",
    why3Body: "You publish your menu (hems, zippers, patches, etc.) with clear prices. Fewer repeated questions and fewer disagreements when the garment arrives.",
    howTitle: "How it works",
    how1Title: "1. You sign up for free",
    how1Body: "A short form: name, WhatsApp, neighborhood, services. Takes 5 minutes.",
    how2Title: "2. You load your price menu",
    how2Body: "We give you a template with the 20 most common alterations at neighborhood prices. Edit or delete whatever you want.",
    how3Title: "3. We approve you within 24h",
    how3Body: "We review your profile manually and ping you on WhatsApp. Once approved, your shop appears in the directory.",
    how4Title: "4. You get customers and payments",
    how4Body: "The customer messages you in the app, you build a quote from your menu, they pay online, and you do the work. You're paid when you confirm delivery.",
    menuTitle: "Sample menu (reference prices)",
    menuSub: "This is the template we load for you at signup. You can edit every price for your area and experience. Naranjogo doesn't set prices for you.",
    menuNote: "Prices may change after a physical inspection — this note appears automatically on every quote.",
    faqTitle: "Frequently asked questions",
    faq1Q: "How much does it cost to sign up?",
    faq1A: "Nothing. Signing up and appearing in the directory is free. Naranjogo only takes a commission per service when you receive an in-app payment — the terms are agreed with you before any charge.",
    faq2Q: "Do I need a physical shop?",
    faq2A: "No. You can work from home, pick up garments, or have a shop. Your profile shows how you work.",
    faq3Q: "How do I get paid?",
    faq3A: "The customer pays in the app by card or OXXO. Your share is deposited to your Mexican bank account once you confirm delivery. You'll need a Mexican CLABE.",
    faq4Q: "What if the alteration is more complicated than expected?",
    faq4A: "You can adjust the quote before starting to sew. Every quote shows the note \"price may change after physical inspection\". The customer accepts the new amount before paying.",
    faq5Q: "Is my WhatsApp number shown publicly?",
    faq5A: "No. Only customers who open a chat inside the app can message you. Your personal number stays private.",
    finalTitle: "Start today. Takes 5 minutes.",
    finalSub: "We load your menu with a 20-item template of common alterations. You just adjust prices and you're done.",
    buyerEyebrow: "Need an alteration?",
    buyerTitle: "Find a tailor near you.",
    buyerSub: "Browse approved tailoring shops in San Miguel de Allende with clear menus and prices.",
    buyerCta: "Browse tailors in SMA",
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
      ? "Arreglos de ropa en San Miguel de Allende | Naranjogo"
      : "Clothing alterations in San Miguel de Allende | Naranjogo";
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

export default function TailoringLandingPage({
  searchParams,
}: {
  searchParams?: { lang?: string };
}) {
  const lang = langFromParam(searchParams?.lang);
  const t = COPY[lang];
  const menu = tailoringStarterMenu();
  const peso = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  const otherLang: Lang = lang === "es" ? "en" : "es";

  const signupHref = `/unete?service=arreglos_de_ropa&lang=${lang}`;
  const browseHref = `/?category=services&q=${encodeURIComponent(
    lang === "es" ? "arreglos de ropa" : "tailoring",
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
              href={`/arreglos-de-ropa?lang=${otherLang}`}
              className="px-3 py-1 rounded-md text-xs font-bold text-[#6B7280] hover:text-[#1B4332]"
            >
              {otherLang === "es" ? t.langToggleEs : t.langToggleEn}
            </Link>
          </div>
        </header>

        <section className="text-center pt-6 pb-10">
          <p className="text-xs font-bold text-[#B45309] uppercase tracking-wider mb-3">
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
              { i: "🧵", t: t.why1Title, b: t.why1Body },
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
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 sm:p-6">
            <h2 className="font-serif text-2xl font-bold text-[#78350F] mb-2">
              {t.menuTitle}
            </h2>
            <p className="text-sm text-[#92400E] leading-relaxed mb-5">{t.menuSub}</p>
            <ul className="divide-y divide-amber-200">
              {menu.items.map((it) => (
                <li
                  key={it.sku}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-[#1C1917] pr-3 min-w-0">
                    {(lang === "en" && it.name_en) || it.name_es}
                  </span>
                  <span className="text-[#78350F] font-bold tabular-nums shrink-0">
                    {peso.format(it.price_mxn_cents / 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs italic text-[#92400E] mt-4 leading-snug">
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
            <p className="text-xs font-bold text-[#B45309] uppercase tracking-wider mb-2">
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
