import type { Lang } from "@/lib/i18n-lang";

export const SERVICE_BOOKING_COPY = {
  es: {
    loading: "Cargando reservas…",
    yourService: "Tu servicio",
    yourListing: "Tu anuncio",
    sellerServiceLead:
      "Los clientes deben escribirte por mensajes en la app y pagar la tarifa de servicio antes de continuar en Naranjogo.",
    sellerGoodsLead:
      "Los compradores deben escribirte por la app y pagar la tarifa de conexión antes de continuar en Naranjogo.",
    loginTitleService: "Reservar este servicio",
    loginTitleGoods: "Contactar al vendedor",
    loginLeadService:
      "Inicia sesión, envía un mensaje en la app y paga la tarifa de servicio para confirmar tu reserva.",
    loginLeadGoods:
      "Inicia sesión, envía un mensaje en la app y paga la tarifa de conexión para continuar.",
    loginBtn: "Iniciar sesión para continuar",
    bookService: "Reservar servicio",
    buyContact: "Comprar / contactar",
    step3InApp: "Continúa en mensajes de la app",
    step3InAppPackage: (n: number) => `Continúa en mensajes de la app (plan de ${n} visitas)`,
    refreshBusy: "Actualizando…",
    refreshBtn: "Ya envié mi mensaje — actualizar",
    goodsFeeBlurb:
      "El precio del artículo lo acuerdas con el vendedor (o pagas fuera de la app). Aquí solo pagas la tarifa de conexión de Naranjogo (comisión; mín. $10 MXN) para continuar en la app.",
    packageScheduleHint:
      "Coordina cada cita en los mensajes de la app. Para seguimiento y nuevas reservas, usa Naranjogo: ahí aplican tus descuentos por lealtad y la garantía.",
    checkoutErr: "Error al crear pago",
  },
  en: {
    loading: "Loading booking…",
    yourService: "Your service",
    yourListing: "Your listing",
    sellerServiceLead:
      "Customers must message you in the app and pay the service fee before continuing on Naranjogo.",
    sellerGoodsLead:
      "Buyers must message you in the app and pay the connection fee before continuing on Naranjogo.",
    loginTitleService: "Book this service",
    loginTitleGoods: "Contact the seller",
    loginLeadService:
      "Log in, send an in-app message, and pay the service fee to confirm your booking.",
    loginLeadGoods:
      "Log in, send an in-app message, and pay the connection fee to continue.",
    loginBtn: "Log in to continue",
    bookService: "Book service",
    buyContact: "Buy / contact",
    step3InApp: "Continue in app messages",
    step3InAppPackage: (n: number) => `Continue in app messages (${n}-visit plan)`,
    refreshBusy: "Refreshing…",
    refreshBtn: "I sent my message — refresh",
    goodsFeeBlurb:
      "You agree the item price with the seller (or pay off-platform). Here you only pay Naranjogo’s connection fee (commission; min. $10 MXN) to continue in the app.",
    packageScheduleHint:
      "Schedule each visit in app messages. Rebook follow-ups through Naranjogo to keep discounts and guarantee coverage.",
    checkoutErr: "Could not start checkout",
  },
} as const;

export function serviceBookingCopy(lang: Lang) {
  return SERVICE_BOOKING_COPY[lang];
}
