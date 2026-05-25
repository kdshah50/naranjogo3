import type { Lang } from "@/lib/i18n-lang";

export function ledgerKindLabel(kind: string, lang: Lang): string {
  const map: Record<string, { es: string; en: string }> = {
    load: { es: "Carga de saldo", en: "Balance top-up" },
    load_bonus: { es: "Bono de carga", en: "Top-up bonus" },
    hold: { es: "Reserva por viaje", en: "Ride hold" },
    release: { es: "Liberación de reserva", en: "Hold release" },
    capture: { es: "Cargo por viaje", en: "Ride charge" },
    refund: { es: "Reembolso", en: "Refund" },
    payout_debit: { es: "Pago a conductor", en: "Driver payout" },
    adjustment: { es: "Ajuste", en: "Adjustment" },
  };
  return map[kind]?.[lang] ?? kind;
}

export function rideStatusLabel(status: string, lang: Lang): string {
  const map: Record<string, { es: string; en: string }> = {
    requested: { es: "Solicitado", en: "Requested" },
    matched: { es: "Asignado", en: "Matched" },
    accepted: { es: "Aceptado", en: "Accepted" },
    arrived: { es: "En origen", en: "At pickup" },
    in_trip: { es: "En curso", en: "In trip" },
    completed: { es: "Completado", en: "Completed" },
    cancelled: { es: "Cancelado", en: "Cancelled" },
    disputed: { es: "En disputa", en: "Disputed" },
  };
  return map[status]?.[lang] ?? status;
}

export function driverTripActionHint(status: string, lang: Lang): string {
  const map: Record<string, { es: string; en: string }> = {
    matched: { es: "Asignado — acepta el viaje", en: "Assigned — accept the ride" },
    accepted: { es: "Aceptado — ve al origen", en: "Accepted — go to pickup" },
    arrived: { es: "En origen — pide el código", en: "At pickup — ask for the code" },
    in_trip: { es: "En curso", en: "In progress" },
  };
  return map[status]?.[lang] ?? "";
}

const VIAJE = {
  es: {
    title: "Pedir viaje",
    subtitle: "Taxi NaranjoGo — prueba Phase 2 + 3 en preview",
    balance: "Saldo",
    loginRequired: "Inicia sesión para pedir un viaje.",
    login: "Entrar",
    sessionError: "No se pudo verificar la sesión.",
    pickDifferentColonias: "Elige colonias diferentes.",
    estimateFailed: "No se pudo estimar",
    requestFailed: "No se pudo solicitar el viaje",
    insufficientBalance: "Saldo insuficiente",
    topUpHint: " — carga saldo en /saldo antes de pedir un viaje.",
    cancelFailed: "No se pudo cancelar",
    tipFailed: "No se pudo enviar propina",
    pickupColonia: "Origen (colonia)",
    dropoffColonia: "Destino (colonia)",
    pickupDetail: "Detalle (opcional) — ej. Plaza Cívica",
    dropoffDetail: "Detalle (opcional)",
    passengers: "Pasajeros",
    estimating: "Calculando…",
    seeFare: "Ver tarifa",
    requesting: "Solicitando…",
    requestTaxi: "Pedir taxi",
    estimatedFare: "Tarifa estimada:",
    balanceHold: "Reserva en saldo:",
    km: "km",
    min: "min",
    surge: "surge",
    rideCreated: "Viaje creado",
    status: "Estado:",
    ticket: "Ticket:",
    findingDriver: "Buscando conductor…",
    noDriversAvailable:
      "No hay conductores disponibles. Un conductor debe completar /conductor, ser aprobado por admin, y servir tu colonia de origen. Pide al conductor que abra /conductor/viajes y toque Conectar, luego intenta de nuevo.",
    rideCancelled: "Viaje cancelado",
    rideActive: "Tu viaje",
    rideMatched: "Conductor asignado",
    cancelRide: "Cancelar viaje",
    tipMxn: "Propina (MXN)",
    sendTip: "Enviar propina",
    whatsappHelp:
      'WhatsApp (Phase 2): envía "taxi de centro a guadalupe" al sandbox de Twilio si configuraste el webhook en',
    whatsappRequires:
      "Requiere saldo en /saldo y un conductor aprobado en la colonia de origen.",
  },
  en: {
    title: "Request a ride",
    subtitle: "NaranjoGo Taxi — Phase 2 + 3 preview",
    balance: "Balance",
    loginRequired: "Sign in to request a ride.",
    login: "Log in",
    sessionError: "Could not verify your session.",
    pickDifferentColonias: "Choose different neighborhoods.",
    estimateFailed: "Could not estimate fare",
    requestFailed: "Could not request the ride",
    insufficientBalance: "Insufficient balance",
    topUpHint: " — top up at /saldo before requesting a ride.",
    cancelFailed: "Could not cancel",
    tipFailed: "Could not send tip",
    pickupColonia: "Pickup (neighborhood)",
    dropoffColonia: "Drop-off (neighborhood)",
    pickupDetail: "Details (optional) — e.g. Plaza Cívica",
    dropoffDetail: "Details (optional)",
    passengers: "Passengers",
    estimating: "Calculating…",
    seeFare: "See fare",
    requesting: "Requesting…",
    requestTaxi: "Request taxi",
    estimatedFare: "Estimated fare:",
    balanceHold: "Balance hold:",
    km: "km",
    min: "min",
    surge: "surge",
    rideCreated: "Ride created",
    status: "Status:",
    ticket: "Ticket:",
    findingDriver: "Finding a driver…",
    noDriversAvailable:
      "No drivers available. A driver must complete /conductor, be approved by admin, and serve your pickup neighborhood. Ask them to open /conductor/viajes and go online, then try again.",
    rideCancelled: "Ride cancelled",
    rideActive: "Your ride",
    rideMatched: "Driver assigned",
    cancelRide: "Cancel ride",
    tipMxn: "Tip (MXN)",
    sendTip: "Send tip",
    whatsappHelp:
      'WhatsApp (Phase 2): send "taxi de centro a guadalupe" to the Twilio sandbox if you configured the webhook at',
    whatsappRequires:
      "Requires balance at /saldo and an approved driver in the pickup neighborhood.",
  },
} as const;

const SALDO = {
  es: {
    title: "Saldo Naranjo",
    subtitle: "Carga saldo prepagado para usar en NaranjoGo.",
    topupSuccessOxxo:
      "Recibimos tu solicitud. Si pagas en OXXO, el saldo aparecerá cuando se confirme el pago.",
    topupSuccessCard: "Recibimos tu pago. Tu saldo se actualizará en unos segundos.",
    topupCancel: "Carga cancelada. Puedes intentarlo nuevamente.",
    availableBalance: "Saldo disponible",
    loadFailed: "No se pudo cargar el saldo",
    confirmingPayment: "Confirmando pago…",
    loading: "Cargando…",
    held: "Reservado:",
    topUpTitle: "Cargar saldo",
    topUpOxxo:
      "Paga en cualquier OXXO o con tarjeta. El saldo se acredita al confirmarse el pago.",
    topUpCard: "Paga con tarjeta. El saldo se acredita al confirmarse el pago.",
    openingPayment: "Abriendo pago…",
    loadAmount: (amt: number) => `Cargar $${amt} MXN`,
    topupFailed: "No se pudo iniciar la carga",
    networkError: "Error de red al iniciar la carga",
    recentActivity: "Últimos movimientos",
  },
  en: {
    title: "Naranjo Balance",
    subtitle: "Prepaid balance for NaranjoGo rides.",
    topupSuccessOxxo:
      "We received your request. If you pay at OXXO, balance will appear once payment is confirmed.",
    topupSuccessCard: "Payment received. Your balance will update in a few seconds.",
    topupCancel: "Top-up cancelled. You can try again.",
    availableBalance: "Available balance",
    loadFailed: "Could not load balance",
    confirmingPayment: "Confirming payment…",
    loading: "Loading…",
    held: "On hold:",
    topUpTitle: "Top up balance",
    topUpOxxo:
      "Pay at any OXXO or by card. Balance is credited once payment is confirmed.",
    topUpCard: "Pay by card. Balance is credited once payment is confirmed.",
    openingPayment: "Opening checkout…",
    loadAmount: (amt: number) => `Top up $${amt} MXN`,
    topupFailed: "Could not start top-up",
    networkError: "Network error starting top-up",
    recentActivity: "Recent activity",
  },
} as const;

const DRIVER_TRIPS = {
  es: {
    title: "Viajes asignados",
    subtitle: "Panel del conductor",
    profile: "Perfil",
    inactiveDriverPrefix: "Tu cuenta de conductor no está activa. Completa ",
    inactiveDriverSuffix: " y pide aprobación al admin.",
    online: "En línea",
    offline: "Fuera de línea",
    onlineHint: "Recibirás viajes en tus colonias de servicio.",
    offlineHint: "Actívate para aparecer en el despacho.",
    disconnect: "Desconectar",
    connect: "Conectar",
    profileLoadFailed: "No se pudo cargar el perfil de conductor",
    toggleFailed: "No se pudo cambiar el estado",
    notApproved: "Tu conductor aún no está aprobado por admin.",
    wrongSession:
      "No encontramos conductor activo para esta sesión. Cierra sesión en /unete e inicia con el mismo WhatsApp del registro (415 181 6902).",
    schemaMissing:
      "Falta migración Phase 4 en Supabase (columnas is_online en driver_profiles).",
    actionFailed: "Acción fallida",
    noActiveTrips: "No tienes viajes activos.",
    estFare: "Tarifa est.:",
    passengerCode: "Código del pasajero:",
    acceptRide: "Aceptar viaje",
    arrivedAtPickup: "Llegué al origen",
    ticketPlaceholder: "NG-XXXXXXXX",
    startRide: "Iniciar viaje",
    completeRide: "Completar viaje",
  },
  en: {
    title: "Assigned rides",
    subtitle: "Driver panel",
    profile: "Profile",
    inactiveDriverPrefix: "Your driver account is not active. Complete ",
    inactiveDriverSuffix: " and ask admin for approval.",
    online: "Online",
    offline: "Offline",
    onlineHint: "You will receive rides in your service neighborhoods.",
    offlineHint: "Go online to appear in dispatch.",
    disconnect: "Go offline",
    connect: "Go online",
    profileLoadFailed: "Could not load driver profile",
    toggleFailed: "Could not change status",
    notApproved: "Your driver account is not approved by admin yet.",
    wrongSession:
      "No active driver for this session. Log out at /unete and sign in with the same WhatsApp used for driver signup (415 181 6902).",
    schemaMissing:
      "Missing Phase 4 migration in Supabase (is_online columns on driver_profiles).",
    actionFailed: "Action failed",
    noActiveTrips: "You have no active rides.",
    estFare: "Est. fare:",
    passengerCode: "Passenger code:",
    acceptRide: "Accept ride",
    arrivedAtPickup: "Arrived at pickup",
    ticketPlaceholder: "NG-XXXXXXXX",
    startRide: "Start ride",
    completeRide: "Complete ride",
  },
} as const;

const CONDUCTOR = {
  es: {
    draftRestored: "Recuperamos tu borrador — puedes seguir donde lo dejaste.",
    draftSaved: "Borrador guardado en este navegador",
    draftEmpty: " (sin datos aún)",
    doneTitle: "¡Solicitud recibida!",
    doneBody:
      "Revisaremos tu licencia, seguro y vehículo en las próximas 24–48 horas. Te contactaremos por WhatsApp cuando estés activo para recibir viajes.",
    doneStripe:
      "Después de la aprobación, configura Stripe Connect en tu perfil para recibir pagos semanales.",
    goToProfile: "Ir a mi perfil",
    backHome: "← Naranjogo",
    title: "Registro de conductor",
    subtitle: "Ofrece transporte en San Miguel con pagos por la billetera Naranjo.",
    step1Title: "Tu información",
    fullName: "Nombre completo",
    whatsapp: "WhatsApp (con código de país)",
    whatsappPlaceholder: "+52 415 000 0000",
    curpOptional: "CURP (opcional)",
    rfcOptional: "RFC (opcional)",
    step2Title: "Licencia y vehículo",
    licenseNumber: "Número de licencia",
    licenseExpiry: "Vencimiento de licencia",
    make: "Marca",
    model: "Modelo",
    year: "Año",
    color: "Color",
    plates: "Placas",
    insurer: "Aseguradora",
    policyNumber: "Número de póliza",
    insuranceExpiry: "Vencimiento del seguro",
    step3Title: "Zonas de servicio",
    primaryColonia: "Colonia principal",
    extraColonias: "Colonias adicionales (opcional)",
    notesOptional: "Notas (opcional)",
    notesPlaceholder: "Horarios, idiomas, tipo de vehículo...",
    step4Title: "Documentos y términos",
    photoHint: (maxMb: number) =>
      `JPEG, PNG o WebP — máximo ${maxMb} MB por foto (se suben una por una).`,
    licensePhoto: "Foto de licencia de conducir",
    vehicleCardPhoto: "Tarjeta de circulación",
    insurancePhoto: "Póliza de seguro",
    acceptTerms:
      "Acepto los términos para conductores: información veraz, revisión manual, y uso de la app para completar viajes.",
    acceptPricing:
      "Entiendo la comisión de la plataforma y que los pagos se procesan por Naranjogo (no efectivo en la app).",
    photosRequired: "Sube las tres fotos requeridas.",
    licenseLabel: "Licencia",
    vehicleCardLabel: "Tarjeta de circulación",
    policyLabel: "Póliza",
    photoTooLarge: (label: string, maxMb: number, sizeMb: string) =>
      `${label}: máximo ${maxMb} MB por foto (la tuya pesa ${sizeMb} MB).`,
    mustAcceptTerms: "Debes aceptar los términos.",
    photoSaveFailed: "No se pudo guardar la foto en el servidor.",
    networkError: "Error de red. Intenta de nuevo.",
    back: "← Atrás",
    continue: "Continuar →",
    submitting: "Enviando…",
    submit: "Enviar solicitud",
    footerDraft:
      "Tu progreso se guarda en este navegador al escribir y al cambiar de paso. Usa siempre la misma URL de preview (cambia en cada deploy de Vercel).",
    clearDraft: "Borrar borrador",
    fileTooLarge: (maxMb: number) => ` — demasiado grande, máx. ${maxMb} MB`,
  },
  en: {
    draftRestored: "We restored your draft — you can continue where you left off.",
    draftSaved: "Draft saved in this browser",
    draftEmpty: " (no data yet)",
    doneTitle: "Application received!",
    doneBody:
      "We will review your license, insurance, and vehicle within 24–48 hours. We will contact you on WhatsApp when you are active to receive rides.",
    doneStripe:
      "After approval, set up Stripe Connect in your profile to receive weekly payouts.",
    goToProfile: "Go to my profile",
    backHome: "← Naranjogo",
    title: "Driver registration",
    subtitle: "Offer rides in San Miguel with Naranjo wallet payments.",
    step1Title: "Your information",
    fullName: "Full name",
    whatsapp: "WhatsApp (with country code)",
    whatsappPlaceholder: "+52 415 000 0000",
    curpOptional: "CURP (optional)",
    rfcOptional: "RFC (optional)",
    step2Title: "License and vehicle",
    licenseNumber: "License number",
    licenseExpiry: "License expiry",
    make: "Make",
    model: "Model",
    year: "Year",
    color: "Color",
    plates: "License plates",
    insurer: "Insurance provider",
    policyNumber: "Policy number",
    insuranceExpiry: "Insurance expiry",
    step3Title: "Service areas",
    primaryColonia: "Primary neighborhood",
    extraColonias: "Additional neighborhoods (optional)",
    notesOptional: "Notes (optional)",
    notesPlaceholder: "Hours, languages, vehicle type...",
    step4Title: "Documents and terms",
    photoHint: (maxMb: number) =>
      `JPEG, PNG or WebP — max ${maxMb} MB per photo (uploaded one at a time).`,
    licensePhoto: "Driver license photo",
    vehicleCardPhoto: "Vehicle registration card",
    insurancePhoto: "Insurance policy",
    acceptTerms:
      "I accept driver terms: truthful information, manual review, and using the app to complete rides.",
    acceptPricing:
      "I understand the platform commission and that payments are processed through Naranjogo (no cash in the app).",
    photosRequired: "Upload all three required photos.",
    licenseLabel: "License",
    vehicleCardLabel: "Vehicle registration",
    policyLabel: "Insurance policy",
    photoTooLarge: (label: string, maxMb: number, sizeMb: string) =>
      `${label}: max ${maxMb} MB per photo (yours is ${sizeMb} MB).`,
    mustAcceptTerms: "You must accept the terms.",
    photoSaveFailed: "Could not save the photo on the server.",
    networkError: "Network error. Please try again.",
    back: "← Back",
    continue: "Continue →",
    submitting: "Submitting…",
    submit: "Submit application",
    footerDraft:
      "Your progress is saved in this browser as you type and when changing steps. Always use the same preview URL (it changes on each Vercel deploy).",
    clearDraft: "Clear draft",
    fileTooLarge: (maxMb: number) => ` — too large, max ${maxMb} MB`,
  },
} as const;

export type ConductorCopy = (typeof CONDUCTOR)[Lang];

export function viajeCopy(lang: Lang) {
  return VIAJE[lang];
}

export function saldoCopy(lang: Lang) {
  return SALDO[lang];
}

export function driverTripsCopy(lang: Lang) {
  return DRIVER_TRIPS[lang];
}

export function conductorCopy(lang: Lang): ConductorCopy {
  return CONDUCTOR[lang];
}

