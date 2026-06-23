import {
  DOG_GROOMING_SERVICE,
  HOUSEKEEPING_SERVICE,
  PET_SITTING_SERVICE,
  PET_WALKING_SERVICE,
  TRANSPORT_APP_SERVICE,
  VETERINARY_SERVICE,
} from "@/lib/provider-services";

export type ServiceQuoteLayout = "default" | "housekeeping";

export function quoteLayoutForSlug(slug: string | null | undefined): ServiceQuoteLayout {
  return slug === HOUSEKEEPING_SERVICE ? "housekeeping" : "default";
}

export function isPetCareSlug(slug: string | null | undefined): boolean {
  return (
    slug === PET_WALKING_SERVICE ||
    slug === PET_SITTING_SERVICE ||
    slug === DOG_GROOMING_SERVICE
  );
}

export function buyerMenuPickerTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "What cleaning do you need?" : "¿Qué limpieza necesitas?";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "What veterinary care do you need?" : "¿Qué servicio veterinario necesitas?";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "What dog walking do you need?" : "¿Qué paseo necesitas?";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "What pet sitting do you need?" : "¿Qué cuidado de mascota necesitas?";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "What grooming do you need?" : "¿Qué estética canina necesitas?";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "Which ride do you need?" : "¿Qué viaje necesitas?";
  }
  return lang === "en" ? "What services do you need?" : "¿Qué servicios necesitas?";
}

export function preferredDatetimeLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Preferred appointment day & time" : "Día y hora preferidos de la cita";
  }
  if (isPetCareSlug(slug)) {
    return lang === "en" ? "Preferred day & time" : "Día y hora preferidos";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "Preferred pickup day & time" : "Día y hora preferidos de recogida";
  }
  return lang === "en" ? "Preferred visit day & time" : "Día y hora preferidos de la visita";
}

export function serviceAddressLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Visit / clinic address" : "Dirección de visita o clínica";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "Pickup address" : "Dirección de recogida";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "From / pickup" : "Origen / recogida";
  }
  return lang === "en" ? "Service address" : "Dirección del servicio";
}

export function dropoffAddressLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "To / drop-off" : "Destino / entrega";
  }
  return lang === "en" ? "Destination" : "Destino";
}

export function serviceRequestNoun(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "cleaning request" : "solicitud de limpieza";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "consultation request" : "solicitud de consulta";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "dog walking request" : "solicitud de paseo";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "pet sitting request" : "solicitud de cuidado";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "grooming request" : "solicitud de estética";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "ride request" : "solicitud de viaje";
  }
  return lang === "en" ? "service request" : "solicitud de servicio";
}

export function serviceDepositConfirmLine(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en"
      ? "Pay the deposit (platform fee) below to confirm your cleaning service."
      : "Paga el depósito (tarifa de plataforma) abajo para confirmar tu servicio de limpieza.";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en"
      ? "Pay the deposit (platform fee) below to confirm your veterinary appointment."
      : "Paga el depósito (tarifa de plataforma) abajo para confirmar tu cita veterinaria.";
  }
  if (isPetCareSlug(slug)) {
    return lang === "en"
      ? "Pay the deposit (platform fee) below to confirm your pet care booking."
      : "Paga el depósito (tarifa de plataforma) abajo para confirmar tu reserva de cuidado de mascotas.";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en"
      ? "Pay the deposit (platform fee) below to confirm your ride."
      : "Paga el depósito (tarifa de plataforma) abajo para confirmar tu viaje.";
  }
  return lang === "en"
    ? "Pay the deposit (platform fee) below to confirm your service."
    : "Paga el depósito (tarifa de plataforma) abajo para confirmar tu servicio.";
}

export function quoteAwaitingProviderLine(slug: string | null | undefined, lang: "es" | "en"): string {
  const noun = serviceRequestNoun(slug, lang);
  if (lang === "en") {
    return `Your ${noun} was sent. The provider must tap Send quote to customer in Messages above. When you receive it, tap Accept quote, then the pay button appears here.`;
  }
  return `Ya enviaste tu ${noun}. El proveedor debe pulsar Enviar cotización al cliente en Mensajes arriba. Cuando la recibas, pulsa Aceptar cotización; entonces aparecerá el botón de pago aquí.`;
}

export function quoteSendRequestLine(slug: string | null | undefined, lang: "es" | "en"): string {
  const noun = serviceRequestNoun(slug, lang);
  if (lang === "en") {
    return `Send your ${noun} in Messages above. When the provider sends a quote, accept it here to pay the deposit.`;
  }
  return `Envía tu ${noun} en Mensajes arriba. Cuando el proveedor envíe la cotización, acéptala para pagar el depósito.`;
}

export function sellerRequestPanelTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  const emoji = sellerRequestPanelEmoji(slug);
  if (lang === "en") return `${emoji} Customer request (breakdown)`;
  return `${emoji} Solicitud del cliente (detalle)`;
}

export function sellerRequestPanelEmoji(slug: string | null | undefined): string {
  if (slug === HOUSEKEEPING_SERVICE) return "🧹";
  if (slug === VETERINARY_SERVICE) return "🐾";
  if (isPetCareSlug(slug)) return "🐕";
  if (slug === TRANSPORT_APP_SERVICE) return "🚕";
  return "📋";
}

export function notifyQuoteSentTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "📋 *New cleaning quote — Naranjogo*" : "📋 *Nueva cotización de limpieza — Naranjogo*";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "📋 *New veterinary quote — Naranjogo*" : "📋 *Nueva cotización veterinaria — Naranjogo*";
  }
  if (isPetCareSlug(slug)) {
    return lang === "en" ? "📋 *New pet care quote — Naranjogo*" : "📋 *Nueva cotización de cuidado de mascotas — Naranjogo*";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "📋 *New ride quote — Naranjogo*" : "📋 *Nueva cotización de viaje — Naranjogo*";
  }
  return lang === "en" ? "📋 *New service quote — Naranjogo*" : "📋 *Nueva cotización de servicio — Naranjogo*";
}

export function notifyBuyerRequestTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "🧹 *New cleaning request — Naranjogo*" : "🧹 *Nueva solicitud de limpieza — Naranjogo*";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "🐾 *New veterinary request — Naranjogo*" : "🐾 *Nueva solicitud veterinaria — Naranjogo*";
  }
  if (isPetCareSlug(slug)) {
    return lang === "en" ? "🐕 *New pet care request — Naranjogo*" : "🐕 *Nueva solicitud de cuidado de mascotas — Naranjogo*";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "🚕 *New ride request — Naranjogo*" : "🚕 *Nueva solicitud de viaje — Naranjogo*";
  }
  return lang === "en" ? "📋 *New service request — Naranjogo*" : "📋 *Nueva solicitud de servicio — Naranjogo*";
}

/** WhatsApp to buyer immediately after they submit a structured service request. */
export function notifyBuyerRequestConfirmationTitle(
  slug: string | null | undefined,
  lang: "es" | "en",
): string {
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "✅ *Grooming request sent — Naranjogo*" : "✅ *Solicitud de estética enviada — Naranjogo*";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "✅ *Cleaning request sent — Naranjogo*" : "✅ *Solicitud de limpieza enviada — Naranjogo*";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "✅ *Consultation request sent — Naranjogo*" : "✅ *Solicitud de consulta enviada — Naranjogo*";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "✅ *Dog walking request sent — Naranjogo*" : "✅ *Solicitud de paseo enviada — Naranjogo*";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "✅ *Pet sitting request sent — Naranjogo*" : "✅ *Solicitud de cuidado enviada — Naranjogo*";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "✅ *Ride request sent — Naranjogo*" : "✅ *Solicitud de viaje enviada — Naranjogo*";
  }
  return lang === "en" ? "✅ *Request sent — Naranjogo*" : "✅ *Solicitud enviada — Naranjogo*";
}

export function notifyBuyerRequestConfirmationLine(
  slug: string | null | undefined,
  lang: "es" | "en",
): string {
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en"
      ? "We notified your groomer. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu esteticista. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en"
      ? "We notified your cleaner. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu equipo de limpieza. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en"
      ? "We notified your vet. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu veterinario. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en"
      ? "We notified your dog walker. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu paseador. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en"
      ? "We notified your pet sitter. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu cuidador. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en"
      ? "We notified your driver. We'll WhatsApp you when they send a quote."
      : "Avisamos a tu conductor. Te escribiremos por WhatsApp cuando envíe la cotización.";
  }
  return lang === "en"
    ? "We notified your provider. We'll WhatsApp you when they send a quote."
    : "Avisamos a tu proveedor. Te escribiremos por WhatsApp cuando envíe la cotización.";
}

export function checkoutFullConnectBlockedMessage(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en"
      ? "For home cleaning, pay the deposit (platform fee) first. The service balance is settled after completion."
      : "Para limpieza del hogar, paga primero el depósito (tarifa de plataforma). El saldo del servicio se liquida al completar.";
  }
  if (slug === VETERINARY_SERVICE) {
    return lang === "en"
      ? "For veterinary care, pay the deposit (platform fee) first. The visit balance is settled after the appointment is complete."
      : "Para servicios veterinarios, paga primero el depósito (tarifa de plataforma). El saldo de la consulta se liquida al completar la cita.";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en"
      ? "For dog walking, pay the deposit (platform fee) first. The walk balance is settled after the service is complete."
      : "Para paseo de perros, paga primero el depósito (tarifa de plataforma). El saldo del paseo se liquida al completar el servicio.";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en"
      ? "For pet sitting, pay the deposit (platform fee) first. The balance is settled after the stay is complete."
      : "Para pet sitting, paga primero el depósito (tarifa de plataforma). El saldo se liquida al terminar el cuidado.";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en"
      ? "For grooming, pay the deposit (platform fee) first. The service balance is settled after grooming is complete."
      : "Para estética canina, paga primero el depósito (tarifa de plataforma). El saldo se liquida al completar el servicio.";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en"
      ? "For rides, pay the deposit (platform fee) first. The trip balance is settled after the ride is complete."
      : "Para viajes, paga primero el depósito (tarifa de plataforma). El saldo del viaje se liquida al completar el trayecto.";
  }
  return lang === "en"
    ? "Pay the deposit (platform fee) first. Full service payment in-app may be available after the job is complete."
    : "Paga primero el depósito (tarifa de plataforma). El pago completo del servicio en la app puede estar disponible al terminar.";
}

export function supplementSummaryTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Visit summary" : "Resumen de la consulta";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "Cleaning summary" : "Resumen de limpieza";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "Walk summary" : "Resumen del paseo";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "Pet sitting summary" : "Resumen del cuidado";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "Grooming summary" : "Resumen de estética";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "Ride summary" : "Resumen del viaje";
  }
  return lang === "en" ? "Service summary" : "Resumen del servicio";
}

export function supplementAppointmentLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Agreed appointment" : "Cita acordada";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "Agreed visit" : "Cita acordada";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "Agreed pickup" : "Recogida acordada";
  }
  return lang === "en" ? "Agreed date" : "Fecha acordada";
}

export function supplementTipDescription(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "100% for your veterinarian" : "100% para tu veterinario";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "100% for your cleaner" : "100% para tu proveedor de limpieza";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "100% for your dog walker" : "100% para tu paseador";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "100% for your pet sitter" : "100% para tu cuidador de mascotas";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "100% for your groomer" : "100% para tu estilista canino";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "100% for your driver" : "100% para tu conductor";
  }
  return lang === "en" ? "100% for your provider" : "100% para tu proveedor";
}

export function notifyBuyerSupplementBalanceDueTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "✅ *Visit completed — Naranjogo*" : "✅ *Consulta completada — Naranjogo*";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "✅ *Cleaning completed — Naranjogo*" : "✅ *Limpieza completada — Naranjogo*";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "✅ *Walk completed — Naranjogo*" : "✅ *Paseo completado — Naranjogo*";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "✅ *Pet sitting completed — Naranjogo*" : "✅ *Cuidado completado — Naranjogo*";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "✅ *Grooming completed — Naranjogo*" : "✅ *Estética completada — Naranjogo*";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "✅ *Ride completed — Naranjogo*" : "✅ *Viaje completado — Naranjogo*";
  }
  return lang === "en" ? "✅ *Service completed — Naranjogo*" : "✅ *Servicio completado — Naranjogo*";
}

export function supplementCheckoutServiceLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Veterinary visit" : "Consulta veterinaria";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "Cleaning service" : "Limpieza del hogar";
  }
  if (slug === PET_WALKING_SERVICE) {
    return lang === "en" ? "Dog walking" : "Paseo de perros";
  }
  if (slug === PET_SITTING_SERVICE) {
    return lang === "en" ? "Pet sitting" : "Pet sitting / cuidado";
  }
  if (slug === DOG_GROOMING_SERVICE) {
    return lang === "en" ? "Dog grooming" : "Estética canina";
  }
  if (slug === TRANSPORT_APP_SERVICE) {
    return lang === "en" ? "Taxi / ride" : "Taxi / transporte";
  }
  return lang === "en" ? "Service" : "Servicio";
}
