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

export function formatCurrencyMXN(centavos: number, lang: Lang): string {
  return new Intl.NumberFormat(intlLocaleForLang(lang), {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}
