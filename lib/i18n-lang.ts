export type Lang = "en" | "es";

export function langFromParam(raw: string | undefined): Lang {
  return raw === "en" || raw === "es" ? raw : "es";
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
