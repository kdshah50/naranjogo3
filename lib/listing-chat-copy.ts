import type { Lang } from "@/lib/i18n-lang";

export const LISTING_CHAT_COPY = {
  es: {
    loading: "Cargando mensajes…",
    loadChatErr: "No se pudo cargar el chat",
    loadErr: "No se pudo cargar",
    loginLead: "Inicia sesión para escribir al vendedor dentro de la app.",
    loginBtn: "Entrar",
    title: "Mensajes en la app",
    subtitle:
      "Canal principal para cotizaciones y avisos. WhatsApp envía alertas con enlace de regreso.",
    refresh: "Actualizar",
    viewListing: "Ver ficha del anuncio",
    allMessages: "Ver todos los mensajes",
    recentBuyers: (n: number, total?: number) =>
      `Compradores recientes (${n}${total && total > n ? ` de ${total}` : ""})`,
    noMessagesYet: "Sin mensajes aún",
    allConversations: "Todas las conversaciones en Mensajes",
    active: "Activo",
    chatWith: "Chateando con",
    agreedTitle: "Precio acordado del trabajo (este comprador)",
    agreedHelp:
      "Opcional: total del trabajo en MXN (si no lo pones, se usa el precio del anuncio o paquete). El comprador paga la tarifa de Naranjogo sobre este monto, o puede pagar el servicio completo en la app si activaste cobros con Stripe.",
    agreedPh: "ej. 850",
    agreedSave: "Guardar",
    agreedClear: "Quitar",
    agreedLoading: "Cargando precio acordado…",
    loadingThread: "Cargando conversación…",
    invalidAmount: "Monto inválido (mín. $1 MXN).",
    requestSent:
      "✓ Solicitud enviada — esperando la cotización oficial del proveedor. Verás Aceptar / Rechazar aquí cuando la envíe.",
    rebookLead:
      "Reservar de nuevo — revisa tus datos y la solicitud, luego envía una nueva cotización.",
    rebookPreparing: "Preparando formulario para reservar de nuevo…",
    quoteStatus: "Estado de cotización",
    quotePending: "Esperando al cliente",
    quoteAccepted: "Aceptada — cliente puede pagar depósito",
    quoteDeclined: "Rechazada",
    quoteDeclinedHint:
      "El cliente rechazó — ajusta habitaciones o precio abajo y vuelve a pulsar «Enviar cotización al cliente».",
    total: "Total",
    placeholderSeller: "Elige un comprador arriba…",
    placeholder: "Escribe un mensaje…",
    send: "Enviar",
    noBuyerThreads: "Aún no hay mensajes de compradores en este anuncio.",
    networkErr: "Error de conexión",
    networkErrAgreed: "Error de red",
    prepareRebookErr: "No se pudo preparar la reserva",
    prepareRebookNetwork: "Error de red al preparar el formulario",
    sendQuoteErr: "No se pudo enviar cotización",
    sendRequestErr: "No se pudo enviar solicitud",
    startChatErr: "No se pudo iniciar el chat",
    noConversation: "Sin conversación",
    pickConversation: "Selecciona una conversación",
    sendMsgErr: "No se pudo enviar",
    saveErr: "No se pudo guardar",
  },
  en: {
    loading: "Loading messages…",
    loadChatErr: "Could not load chat",
    loadErr: "Could not load",
    loginLead: "Log in to message the seller in the app.",
    loginBtn: "Log in",
    title: "In-app messages",
    subtitle:
      "Primary channel for quotes and updates. WhatsApp sends alerts with a link back here.",
    refresh: "Refresh",
    viewListing: "View listing page",
    allMessages: "View all messages",
    recentBuyers: (n: number, total?: number) =>
      `Recent buyers (${n}${total && total > n ? ` of ${total}` : ""})`,
    noMessagesYet: "No messages yet",
    allConversations: "All conversations in Messages",
    active: "Active",
    chatWith: "Chat with",
    agreedTitle: "Agreed job total (this buyer)",
    agreedHelp:
      "Optional: total for this job in MXN (same base as listing/package unless you set this). Buyer pays the platform fee on this amount, or can pay the full service in-app if you have Stripe payouts.",
    agreedPh: "e.g. 850",
    agreedSave: "Save",
    agreedClear: "Clear",
    agreedLoading: "Loading agreed total…",
    loadingThread: "Loading thread…",
    invalidAmount: "Enter a valid amount (at least $1 MXN).",
    requestSent:
      "✓ Request sent — waiting for your provider’s official quote. You’ll get Accept / Decline buttons here when they send it.",
    rebookLead:
      "Book again — review your contact details and service request, then send a new quote request.",
    rebookPreparing: "Preparing your rebook form…",
    quoteStatus: "Quote status",
    quotePending: "Waiting for customer",
    quoteAccepted: "Accepted — customer can pay deposit",
    quoteDeclined: "Declined",
    quoteDeclinedHint:
      "Customer declined — adjust rooms or price in the quote builder below, then tap Send official quote again.",
    total: "Total",
    placeholderSeller: "Choose a buyer above…",
    placeholder: "Type a message…",
    send: "Send",
    noBuyerThreads: "No buyer messages on this listing yet.",
    networkErr: "Connection error",
    networkErrAgreed: "Network error",
    prepareRebookErr: "Could not prepare rebook",
    prepareRebookNetwork: "Network error preparing rebook form",
    sendQuoteErr: "Could not send quote",
    sendRequestErr: "Could not send request",
    startChatErr: "Could not start chat",
    noConversation: "No conversation",
    pickConversation: "Select a conversation",
    sendMsgErr: "Could not send",
    saveErr: "Could not save",
  },
} as const satisfies Record<Lang, Record<string, unknown>>;

export function listingChatCopy(lang: Lang) {
  return LISTING_CHAT_COPY[lang];
}

/** Rephrase stored [Naranjogo] lines so providers see client-facing copy, not “your payment”. */
export function formatListingChatSystemBody(
  body: string,
  role: "buyer" | "seller" | null,
  lang: Lang,
): string {
  if (!body.startsWith("[Naranjogo]") || role !== "seller") return body;

  const ticketMatch = body.match(/Ticket:\s*([A-Z0-9-]+)/i);
  const ticket = ticketMatch?.[1];

  if (/Tarifa de plataforma pagada|depósito de plataforma pagado/i.test(body)) {
    if (lang === "en") {
      return `[Naranjogo] Your client paid the platform deposit.${ticket ? ` Ticket: ${ticket}.` : ""} Message them below to schedule the visit.`;
    }
    return `[Naranjogo] Tu cliente pagó el depósito de plataforma.${ticket ? ` Ticket: ${ticket}.` : ""} Escríbele abajo para coordinar la visita.`;
  }

  return body;
}
