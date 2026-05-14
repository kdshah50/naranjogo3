"use client";

import Link from "next/link";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

type FaqItem = { q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const COPY: Record<
  Lang,
  { back: string; pageTitle: string; intro: string; buyers: FaqSection; providers: FaqSection; trust: FaqSection }
> = {
    es: {
      back: "← Inicio",
      pageTitle: "Preguntas frecuentes",
      intro:
        "Cómo funciona Naranjogo (Tianguis): reservas, pagos, confianza con proveedores verificados, mensajes en la app y privacidad.",
      buyers: {
        title: "Soy comprador o cliente",
        items: [
          {
            q: "¿Por qué debo escribir primero en la app?",
            a: "Así confirmamos que hubo contacto real con el proveedor antes de cobrar la tarifa de la plataforma. Después de enviar un mensaje en “Mensajes en la app”, puedes pagar y continuar con la reserva.",
          },
          {
            q: "¿Qué pago exactamente en Stripe?",
            a: "Por defecto pagas solo la tarifa de Naranjogo (comisión sobre el precio del anuncio, paquete o el precio acordado que fijó tu proveedor). Eso desbloquea el WhatsApp del proveedor desde la app. El precio final del trabajo a menudo lo coordinas aparte con el proveedor, salvo que elijas pagar el servicio completo en la app (ver siguiente pregunta).",
          },
          {
            q: "¿Puedo pagar el servicio completo por la app?",
            a: "Sí, cuando el proveedor tiene cobros con Stripe Connect activos. En ese caso verás la opción de pagar el subtotal del servicio más la comisión de plataforma y el IVA, en un solo checkout. Si no ves esa opción, el proveedor aún no activó cobros en Naranjogo: puedes usar solo la tarifa de plataforma y coordinar el resto por WhatsApp.",
          },
          {
            q: "¿Qué es el “precio acordado”?",
            a: "Si el total del trabajo no coincide con el precio del anuncio, tu proveedor puede guardar un monto acordado contigo en el chat (en pesos mexicanos). La tarifa de Naranjogo y, si aplica, el pago completo se calculan sobre ese monto.",
          },
          {
            q: "¿Naranjogo agenda la cita o el horario?",
            a: "La fecha y hora exactas las acuerdan ustedes por WhatsApp (o como prefieran). La app no sustituye la agenda del proveedor.",
          },
          {
            q: "¿Qué son los planes de varias visitas?",
            a: "Algunos anuncios ofrecen un paquete (varias sesiones por un total). Una sola tarifa de plataforma puede cubrir todo el plan; cada visita sigue coordinándose con el proveedor.",
          },
          {
            q: "¿Dónde veo mis reservas y descuentos?",
            a: "En “Mis reservas”. Si vuelves a reservar servicios pagados por la app, pueden aplicar beneficios por lealtad sobre la tarifa de plataforma, según las reglas activas en tu cuenta.",
          },
        ],
      },
      providers: {
        title: "Soy proveedor de servicios",
        items: [
          {
            q: "¿Cómo fijo un precio acordado con un cliente?",
            a: "En la ficha de tu anuncio, abre “Mensajes en la app”, elige la conversación con ese comprador y usa el recuadro “Precio acordado del trabajo”. Guarda el total en pesos MXN; el cliente verá la tarifa (y el pago completo, si tienes Stripe) calculados sobre ese monto.",
          },
          {
            q: "¿Qué necesito para que me paguen el servicio completo por la app?",
            a: "Debes completar el alta de cobros con Stripe Connect (cuenta conectada) en tu perfil o panel de vendedor, según lo que muestre Naranjogo. Sin eso, los clientes solo pueden pagar la tarifa de la plataforma y el resto lo acuerdan contigo fuera de la app.",
          },
          {
            q: "¿Cuándo veo el WhatsApp del cliente?",
            a: "El cliente accede a tu WhatsApp desde la app después de pagar la tarifa (o el checkout completo). Recibirás avisos habituales cuando se confirme el pago.",
          },
          {
            q: "¿El carrito de artículos es lo mismo que las reservas de servicio?",
            a: "No. Los artículos (productos) van por el carrito con reglas propias. Los servicios usan el flujo de reserva, mensaje previo y pago de tarifa o pago vía Connect.",
          },
          {
            q: "¿Qué pasa si el cliente no paga la tarifa?",
            a: "No se desbloquea el contacto por la app hasta que el pago se complete en Stripe. Puedes seguir hablando solo por los mensajes dentro de la app hasta ese momento.",
          },
        ],
      },
      trust: {
        title: "Confianza, verificación y privacidad",
        items: [
          {
            q: "¿Qué es un proveedor verificado en Naranjogo?",
            a: "Además de los anuncios que el equipo puede revisar antes de publicarse, los proveedores pueden sumar señales de identidad y confianza: verificación de INE o RFC cuando aplica, teléfono/WhatsApp verificado, e insignias de nivel (por ejemplo Bronce, Oro o Diamante). La ficha del servicio muestra estas señales para que compares con más contexto antes de reservar.",
          },
          {
            q: "¿Qué significan los trabajos completados que aparecen en el anuncio?",
            a: "Mostramos cuántas reservas se pagaron por la app en ese anuncio y cuántas el proveedor marcó como completadas, además de totales agregados de sus otros anuncios cuando aplica. Son métricas de actividad real en la plataforma, no números inventados.",
          },
          {
            q: "¿Las reseñas son confiables?",
            a: "Las reseñas visibles en fichas de servicios están ligadas a reservas pagadas y completadas por la app: no son comentarios anónimos de redes sociales. Eso ayuda a reflejar experiencias de clientes que sí usaron el flujo de Naranjogo.",
          },
          {
            q: "¿Por qué pedir mensaje en la app antes de pagar?",
            a: "Dejamos constancia de contacto y reducimos patrones típicos de fraude (por ejemplo solicitudes de pago o datos por canales externos sin contexto). El WhatsApp del proveedor se abre desde la app cuando el pago correspondiente se confirma en Stripe.",
          },
          {
            q: "¿Comparten mis datos o los del vendedor?",
            a: "Usamos la información para operar cuentas, mensajes en la app, pagos y obligaciones legales — no como listado público de teléfonos entre usuarios. Los detalles están en el aviso de privacidad. El flujo prioriza la reserva y la transacción con contexto, no exponer contactos sin el paso de pago donde aplica.",
          },
          {
            q: "¿Qué más incluye la plataforma además del listado?",
            a: "Pagos con Stripe (tarifa o servicio completo cuando el proveedor tiene Connect); garantía en reservas elegibles; descuentos por lealtad sobre la tarifa; carrito con Connect para productos; y panel de reservas y estados para proveedores. El producto sigue creciendo a partir de este modelo.",
          },
        ],
      },
    },
    en: {
      back: "← Home",
      pageTitle: "Frequently asked questions",
      intro:
        "How Naranjogo (Tianguis) works: bookings, payments, verified providers, in-app messaging, and privacy.",
      buyers: {
        title: "I’m a buyer / client",
        items: [
          {
            q: "Why do I have to message in the app first?",
            a: "It shows you actually contacted the provider before the platform fee is charged. After you send a message in “Messages in the app,” you can pay and continue the booking.",
          },
          {
            q: "What am I paying in Stripe?",
            a: "By default you pay only Naranjogo’s platform fee (a commission on the listing price, package total, or an agreed total the provider set for you). That unlocks the provider’s WhatsApp link in the app. The full job price is often settled directly with the provider unless you choose full in-app checkout (next question).",
          },
          {
            q: "Can I pay the full service in the app?",
            a: "Yes, when the provider has Stripe Connect payouts enabled. You’ll see an option to pay the service subtotal plus the platform fee and VAT in one checkout. If you don’t see it, they haven’t finished Connect onboarding—you can still pay the platform fee only and arrange the rest on WhatsApp.",
          },
          {
            q: "What is the “agreed price”?",
            a: "If the job total differs from the listing, your provider can save an agreed MXN total for you in chat. Naranjogo’s fee (and full checkout, if available) is calculated on that amount.",
          },
          {
            q: "Does Naranjogo book the appointment time?",
            a: "Exact date and time are between you and the provider (usually confirmed on WhatsApp). The app doesn’t control their calendar.",
          },
          {
            q: "What are multi-visit plans?",
            a: "Some listings sell a package (several sessions for one total). One platform fee may cover the whole plan; you still schedule each visit with the provider.",
          },
          {
            q: "Where are my bookings and discounts?",
            a: "Under “My bookings.” Repeat paid bookings through the app may earn loyalty discounts on the platform fee, per your account rules.",
          },
        ],
      },
      providers: {
        title: "I’m a service provider",
        items: [
          {
            q: "How do I set an agreed price for a client?",
            a: "On your listing, open “Messages in the app,” select that buyer’s thread, and use the “Agreed job total” box. Save the amount in MXN; their fee (and full checkout, if you use Connect) will use that base.",
          },
          {
            q: "What do I need for clients to pay the full service in the app?",
            a: "Complete Stripe Connect (Express) onboarding in Naranjogo so your account can receive transfers. Without it, clients can only pay the platform fee and pay the service balance with you outside the app.",
          },
          {
            q: "When does the client get my WhatsApp?",
            a: "After they pay the platform fee or complete full checkout, they can open your WhatsApp from the app. You’ll get the usual notifications when payment succeeds.",
          },
          {
            q: "Is the product cart the same as service bookings?",
            a: "No. Goods use the cart flow with its own rules. Services use bookings, in-app messaging first, then fee or Connect checkout.",
          },
          {
            q: "What if the client doesn’t pay the fee?",
            a: "WhatsApp isn’t unlocked through Naranjogo until Stripe confirms payment. You can still chat in-app until then.",
          },
        ],
      },
      trust: {
        title: "Trust, verification & privacy",
        items: [
          {
            q: "What does “verified provider” mean on Naranjogo?",
            a: "Beyond listings our team can review before they go live, providers can add identity and trust signals—such as INE or RFC checks where applicable, verified phone/WhatsApp, and tier badges (e.g. Bronze, Gold, Diamond). The listing shows these so you can compare providers with more context before booking.",
          },
          {
            q: "What are the “completed jobs” numbers on a listing?",
            a: "We show how many bookings were paid through the app on that ad and how many the provider marked completed, plus rolled-up totals across their other listings when relevant. These are real platform metrics—not vanity counters.",
          },
          {
            q: "Can I trust the reviews?",
            a: "Reviews on service listings are tied to paid, completed bookings on Naranjogo—not anonymous social comments. That better reflects clients who actually used the in-app flow.",
          },
          {
            q: "Why require in-app messaging before paying?",
            a: "It leaves a trace of contact and cuts common scam patterns (e.g. someone asking for money or personal data off-platform with no context). The provider’s WhatsApp opens from the app after the relevant payment confirms in Stripe.",
          },
          {
            q: "Do you share my information—or the seller’s?",
            a: "We use personal data to run accounts, in-app messages, payments, and legal obligations—not as a public phone book between users. See the privacy notice for specifics. The flow is built around bookings and transactions with context, not exposing contacts without the payment step where it applies.",
          },
          {
            q: "What else does the platform offer beyond a directory?",
            a: "Secure Stripe checkout for platform fees or full service payments (when the provider uses Connect); guarantee coverage on eligible bookings; loyalty savings on booking fees; a cart with Connect for goods; and seller tools for bookings and status. We’re continuing to build on this foundation.",
          },
        ],
      },
    },
  };

function FaqDetails({ item }: { item: FaqItem }) {
  return (
    <details className="group border border-[#E5E0D8] rounded-xl bg-white open:shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-[#1B4332] text-sm flex items-center justify-between gap-2">
        <span className="pr-2">{item.q}</span>
        <span className="text-[#6B7280] text-lg leading-none shrink-0 group-open:rotate-180 transition-transform" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="px-4 pb-3 pt-0 text-sm text-[#374151] leading-relaxed border-t border-[#F4F0EB]">
        <p className="pt-3">{item.a}</p>
      </div>
    </details>
  );
}

export default function FaqClient() {
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
        <h1 className="text-2xl font-serif font-bold text-[#1B4332] mb-3">{t.pageTitle}</h1>
        <p className="text-sm text-[#57534E] mb-8 leading-relaxed">{t.intro}</p>

        <section className="mb-10">
          <h2 className="text-lg font-bold text-[#1C1917] mb-4">{t.buyers.title}</h2>
          <div className="space-y-3">
            {t.buyers.items.map((item, i) => (
              <FaqDetails key={`b-${i}`} item={item} />
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#1C1917] mb-4">{t.providers.title}</h2>
          <div className="space-y-3">
            {t.providers.items.map((item, i) => (
              <FaqDetails key={`p-${i}`} item={item} />
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold text-[#1C1917] mb-4">{t.trust.title}</h2>
          <div className="space-y-3">
            {t.trust.items.map((item, i) => (
              <FaqDetails key={`t-${i}`} item={item} />
            ))}
          </div>
        </section>

        <p className="text-xs text-[#6B7280] leading-relaxed">
          {lang === "en" ? (
            <>
              More on claims and refunds:{" "}
              <Link href="/claims" className="text-[#1B4332] font-semibold hover:underline">
                Guarantee / claims
              </Link>
              . Legal:{" "}
              <Link href="/terms" className="text-[#1B4332] font-semibold hover:underline">
                Terms
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-[#1B4332] font-semibold hover:underline">
                Privacy
              </Link>
              .
            </>
          ) : (
            <>
              Más sobre garantía y reportes:{" "}
              <Link href="/claims" className="text-[#1B4332] font-semibold hover:underline">
                Garantía / reclamaciones
              </Link>
              . Legales:{" "}
              <Link href="/terms" className="text-[#1B4332] font-semibold hover:underline">
                Términos
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-[#1B4332] font-semibold hover:underline">
                Privacidad
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </main>
  );
}
