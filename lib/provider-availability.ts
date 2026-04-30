/** Provider signup (/unete) — weekly schedules + serialization for listings.availability_summary */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DayMeridian = "AM" | "PM";

export interface DayAvailability {
  closed: boolean;
  /** 1–12 */
  fromHour: number;
  fromMeridian: DayMeridian;
  /** 1–12 */
  toHour: number;
  toMeridian: DayMeridian;
}

export type AvailabilityMode = "on_demand" | "weekly_hours";

export const WEEKDAYS: { key: WeekdayKey; es: string; en: string }[] = [
  { key: "mon", es: "Lunes", en: "Monday" },
  { key: "tue", es: "Martes", en: "Tuesday" },
  { key: "wed", es: "Miércoles", en: "Wednesday" },
  { key: "thu", es: "Jueves", en: "Thursday" },
  { key: "fri", es: "Viernes", en: "Friday" },
  { key: "sat", es: "Sábado", en: "Saturday" },
  { key: "sun", es: "Domingo", en: "Sunday" },
];

export const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export const MERIDIANS: DayMeridian[] = ["AM", "PM"];

export function defaultWeeklyAvailability(): Record<WeekdayKey, DayAvailability> {
  const closed: DayAvailability = {
    closed: true,
    fromHour: 9,
    fromMeridian: "AM",
    toHour: 5,
    toMeridian: "PM",
  };
  const open: DayAvailability = {
    closed: false,
    fromHour: 9,
    fromMeridian: "AM",
    toHour: 5,
    toMeridian: "PM",
  };
  return {
    mon: { ...open },
    tue: { ...open },
    wed: { ...open },
    thu: { ...open },
    fri: { ...open },
    sat: { ...closed },
    sun: { ...closed },
  };
}

export function formatTime12Lang(hour: number, meridian: DayMeridian, lang: "es" | "en"): string {
  if (lang === "es") {
    const suf = meridian === "AM" ? "a. m." : "p. m.";
    return `${hour}:00 ${suf}`;
  }
  return `${hour}:00 ${meridian}`;
}

export function buildAvailabilitySummaryString(
  lang: "es" | "en",
  mode: AvailabilityMode,
  weekly: Record<WeekdayKey, DayAvailability>,
  notes: string
): string {
  const trimmedNotes = notes.trim();
  const parts: string[] = [];

  if (mode === "on_demand") {
    parts.push(
      lang === "es"
        ? "Tipo: Servicio bajo demanda — el horario se coordina por WhatsApp con cada cliente."
        : "Availability: On-demand — times are coordinated by WhatsApp with each client."
    );
  } else {
    parts.push(lang === "es" ? "Horario habitual (por día):" : "Weekly hours:");
    const dayLines = WEEKDAYS.map(({ key, es, en }) => {
      const slot = weekly[key];
      const dayLabel = lang === "es" ? es : en;
      if (slot.closed) {
        return `${dayLabel}: ${lang === "es" ? "Cerrado" : "Closed"}`;
      }
      const from = formatTime12Lang(slot.fromHour, slot.fromMeridian, lang);
      const to = formatTime12Lang(slot.toHour, slot.toMeridian, lang);
      return `${dayLabel}: ${from} – ${to}`;
    });
    parts.push(dayLines.join("\n"));
  }

  if (trimmedNotes.length > 0) {
    parts.push("");
    parts.push(
      `${lang === "es" ? "Notas adicionales" : "Additional notes"}: ${trimmedNotes}`
    );
  }

  return parts.join("\n").trim();
}
