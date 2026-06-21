import {
  DOG_GROOMING_SERVICE,
  HOUSEKEEPING_SERVICE,
  PET_SITTING_SERVICE,
  PET_WALKING_SERVICE,
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
  return lang === "en" ? "What services do you need?" : "¿Qué servicios necesitas?";
}

export function preferredDatetimeLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Preferred appointment day & time" : "Día y hora preferidos de la cita";
  }
  if (isPetCareSlug(slug)) {
    return lang === "en" ? "Preferred day & time" : "Día y hora preferidos";
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
  return lang === "en" ? "Service address" : "Dirección del servicio";
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
  return lang === "en" ? "📋 *New service request — Naranjogo*" : "📋 *Nueva solicitud de servicio — Naranjogo*";
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
  return lang === "en" ? "Service summary" : "Resumen del servicio";
}

export function supplementAppointmentLabel(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "Agreed appointment" : "Cita acordada";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "Agreed visit" : "Cita acordada";
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
  return lang === "en" ? "100% for your provider" : "100% para tu proveedor";
}

export function notifyBuyerSupplementBalanceDueTitle(slug: string | null | undefined, lang: "es" | "en"): string {
  if (slug === VETERINARY_SERVICE) {
    return lang === "en" ? "✅ *Visit completed — Naranjogo*" : "✅ *Consulta completada — Naranjogo*";
  }
  if (slug === HOUSEKEEPING_SERVICE) {
    return lang === "en" ? "✅ *Cleaning completed — Naranjogo*" : "✅ *Limpieza completada — Naranjogo*";
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
  return lang === "en" ? "Service" : "Servicio";
}
