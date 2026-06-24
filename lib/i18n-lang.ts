export type Lang = "en" | "es";

export const NARANJO_LANG_COOKIE = "naranjo_lang";

export function langFromParam(raw: string | undefined): Lang {
  return raw === "en" || raw === "es" ? raw : "es";
}

/** URL `?lang=` wins, then language cookie, else Spanish. */
export function resolveAppLang(
  searchParamLang: string | undefined,
  cookieLang: string | undefined,
): Lang {
  if (searchParamLang === "en" || searchParamLang === "es") return searchParamLang;
  if (cookieLang === "en" || cookieLang === "es") return cookieLang;
  return "es";
}

export function persistAppLangClient(lang: Lang) {
  try {
    localStorage.setItem(NARANJO_LANG_COOKIE, lang);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${NARANJO_LANG_COOKIE}=${lang};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/** Append `?lang=` or `&lang=` so navigation stays in the chosen language. */
export function withLang(path: string, lang: Lang): string {
  if (lang !== "en") return path;
  const hashIdx = path.indexOf("#");
  const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const qIdx = base.indexOf("?");
  if (qIdx >= 0) {
    const qs = new URLSearchParams(base.slice(qIdx + 1));
    qs.set("lang", lang);
    return `${base.slice(0, qIdx)}?${qs.toString()}${hash}`;
  }
  return `${base}?lang=${lang}${hash}`;
}

export function intlLocale(lang: Lang): string {
  return lang === "en" ? "en-MX" : "es-MX";
}
