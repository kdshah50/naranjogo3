import type { Lang } from "@/lib/i18n-lang";

export const REPORT_COPY = {
  es: {
    reasons: [
      { value: "fraud", label: "Fraude / estafa" },
      { value: "fake_listing", label: "Anuncio falso" },
      { value: "misleading", label: "Información engañosa" },
      { value: "inappropriate", label: "Contenido inapropiado" },
      { value: "spam", label: "Spam" },
      { value: "other", label: "Otro" },
    ],
    pickReason: "Selecciona un motivo",
    loginRequired: "Inicia sesión para reportar",
    sendErr: "Error al enviar",
    networkErr: "Error de conexión",
    done: "✓ Reporte enviado — lo revisaremos pronto",
    button: "Reportar",
    title: "Reportar anuncio",
    blurb: "Tu reporte es anónimo para el vendedor. Nuestro equipo lo revisará en 24 horas.",
    detailsPh: "Detalles adicionales (opcional)",
    cancel: "Cancelar",
    submitting: "Enviando…",
    submit: "Enviar reporte",
  },
  en: {
    reasons: [
      { value: "fraud", label: "Fraud / scam" },
      { value: "fake_listing", label: "Fake listing" },
      { value: "misleading", label: "Misleading information" },
      { value: "inappropriate", label: "Inappropriate content" },
      { value: "spam", label: "Spam" },
      { value: "other", label: "Other" },
    ],
    pickReason: "Select a reason",
    loginRequired: "Log in to report",
    sendErr: "Could not submit",
    networkErr: "Connection error",
    done: "✓ Report submitted — we’ll review it soon",
    button: "Report",
    title: "Report listing",
    blurb: "Your report is anonymous to the seller. Our team will review it within 24 hours.",
    detailsPh: "Additional details (optional)",
    cancel: "Cancel",
    submitting: "Sending…",
    submit: "Submit report",
  },
} as const;

export function reportCopy(lang: Lang) {
  return REPORT_COPY[lang];
}
