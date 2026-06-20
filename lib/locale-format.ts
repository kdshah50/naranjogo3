import type { Lang } from "@/lib/i18n-lang";

/** BCP 47 locale for Intl formatters (dates, times, numbers) */
export function intlLocaleForLang(lang: Lang): string {
  return lang === "en" ? "en-MX" : "es-MX";
}

export function formatDateTimeShort(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(intlLocaleForLang(lang), {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Calendar date only (no time). */
export function formatDateMedium(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(intlLocaleForLang(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Day bucket key for grouping chat messages (local calendar day). */
export function conversationDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Section label above messages grouped by day (Hoy / Ayer / date). */
export function formatConversationDayLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000);
  if (diffDays === 0) return lang === "en" ? "Today" : "Hoy";
  if (diffDays === 1) return lang === "en" ? "Yesterday" : "Ayer";
  return formatDateMedium(iso, lang);
}

export function formatCurrencyMXN(centavos: number, lang: Lang): string {
  return new Intl.NumberFormat(intlLocaleForLang(lang), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}
