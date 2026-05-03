/**
 * Amazon-style retention microcopy: rebook nudges, weekend window, optional local promo (env).
 * Times use America/Mexico_City for “weekend deals” alignment.
 */

const MX_TZ = "America/Mexico_City";

function envLine(key: string): string | null {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : null;
}

export function mexicoCityNowParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: MX_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  return { weekday, hour };
}

/** Fri 17:00–Sun (Mexico City) — soft “weekend deals” window for WhatsApp / banners. */
export function isRetentionWeekendDealWindow(d: Date = new Date()): boolean {
  const { weekday, hour } = mexicoCityNowParts(d);
  if (weekday === "Sat" || weekday === "Sun") return true;
  if (weekday === "Fri" && hour >= 17) return true;
  return false;
}

export function retentionWeekendPromoLineEs(now: Date = new Date()): string | null {
  if (!isRetentionWeekendDealWindow(now)) return null;
  return envLine("RETENTION_WEEKEND_PROMO_ES");
}

/** Local / colonia promos: only with longer spacing or during weekend window (lighter on 7‑day nudges). */
export function retentionLocalPromoLineEs(
  offsetDays: number | null,
  now: Date = new Date(),
): string | null {
  const line = envLine("RETENTION_LOCAL_PROMO_ES");
  if (!line) return null;
  const d = offsetDays ?? 0;
  if (d >= 30 || isRetentionWeekendDealWindow(now)) return line;
  return null;
}

export function buildRebookReminderMessageEs(input: {
  hello: string;
  title: string;
  link: string;
  offsetDays: number | null;
  city: string | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const days = input.offsetDays ?? 30;
  let opener: string;
  if (days >= 30) {
    opener = `Ya van ${days} días desde tu última reserva en Naranjogo — para muchos servicios locales es buen momento de volver.`;
  } else if (days >= 14) {
    opener = `Han pasado ${days} días — ¿listo para tu siguiente visita?`;
  } else {
    opener = `Te recordamos programar tu próxima cita con buen tiempo.`;
  }

  const cityLine = input.city?.trim() ? `\n📌 Zona: ${input.city.trim()}` : "";

  let body = `${input.hello} 👋

${opener}

📍 Servicio: «${input.title}»${cityLine}

Reserva otra vez en la app (y aplica tu descuento por lealtad si corresponde):
${input.link}`;

  const wk = retentionWeekendPromoLineEs(now);
  const loc = retentionLocalPromoLineEs(input.offsetDays, now);
  if (wk) body += `\n\n🌟 Oferta fin de semana: ${wk}`;
  if (loc) body += `\n\n📣 ${loc}`;

  return body;
}

export function buildAppointmentReminderMessageEs(input: {
  hello: string;
  title: string;
  link: string;
  city: string | null;
  appointmentAt: string | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  let whenLine: string;
  if (input.appointmentAt) {
    try {
      const dt = new Date(input.appointmentAt);
      whenLine = `Tu cita para «${input.title}» es el ${dt.toLocaleString("es-MX", {
        timeZone: MX_TZ,
        dateStyle: "full",
        timeStyle: "short",
      })}.`;
    } catch {
      whenLine = `Te recordamos tu próxima cita relacionada con «${input.title}».`;
    }
  } else {
    whenLine = `Te recordamos tu próxima cita relacionada con «${input.title}».`;
  }

  const cityLine = input.city?.trim() ? `\n📌 Zona: ${input.city.trim()}` : "";

  let body = `${input.hello}: ${whenLine}${cityLine}

Abre Naranjogo para detalles y el enlace al proveedor:
${input.link}`;

  const wk = retentionWeekendPromoLineEs(now);
  if (wk) body += `\n\n🌟 ${wk}`;

  return body;
}

/** Server-rendered home strip (optional). Weekend line wins when set + in window. */
export function getHomeRetentionBannerText(lang: "es" | "en", now: Date = new Date()): string | null {
  const weekend =
    lang === "es" ? envLine("RETENTION_HOME_WEEKEND_BANNER_ES") : envLine("RETENTION_HOME_WEEKEND_BANNER_EN");
  const general = lang === "es" ? envLine("RETENTION_HOME_BANNER_ES") : envLine("RETENTION_HOME_BANNER_EN");

  if (isRetentionWeekendDealWindow(now) && weekend) return weekend;
  return general;
}
