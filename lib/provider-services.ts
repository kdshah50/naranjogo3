/** Shared catalog for service-provider signup (Únete) — keep in sync with admin expectations. */

export type ProviderLanguageMode = "bilingual" | "spanish_only" | "english_only";
export type ServiceLocationMode = "in_house" | "on_site_only";

export const PROVIDER_LANGUAGE_OPTIONS: {
  value: ProviderLanguageMode;
  es: string;
  en: string;
}[] = [
  { value: "bilingual", es: "Bilingüe (español e inglés)", en: "Bilingual (Spanish & English)" },
  { value: "spanish_only", es: "Solo español", en: "Spanish only" },
  { value: "english_only", es: "Solo inglés", en: "English only" },
];

export const SERVICE_LOCATION_OPTIONS: {
  value: ServiceLocationMode;
  es: string;
  en: string;
}[] = [
  { value: "in_house", es: "En mi local / taller (in-house)", en: "At my shop or premises (in-house)" },
  { value: "on_site_only", es: "Solo a domicilio / en tu ubicación (on-site)", en: "On-site at the client's location only" },
];

export const PROVIDER_SERVICES = [
  { value: "plomero", es: "Plomero", en: "Plumber" },
  { value: "electricista", es: "Electricista", en: "Electrician" },
  { value: "mecanico", es: "Mecánico", en: "Mechanic" },
  { value: "pintor", es: "Pintor", en: "Painter" },
  { value: "jardinero", es: "Jardinero", en: "Gardener" },
  { value: "limpieza", es: "Limpieza del hogar", en: "House Cleaning" },
  { value: "ac", es: "Técnico AC", en: "AC Technician" },
  { value: "dentista", es: "Dentista", en: "Dentist" },
  { value: "niera", es: "Niñera / Nanny", en: "Babysitter / Nanny" },
  { value: "cuidado_mayores", es: "Cuidado adultos mayores", en: "Senior Care" },
  { value: "paseador", es: "Paseador de perros", en: "Dog Walker" },
  { value: "pet_sitting", es: "Pet sitting / Hospedaje", en: "Pet Sitting / Boarding" },
  { value: "estetica_canina", es: "Estética canina", en: "Dog Grooming" },
  { value: "mandados", es: "Mandados bilingüe", en: "Bilingual Errands" },
  { value: "chofer", es: "Chofer privado", en: "Private Driver" },
  { value: "tramites", es: "Trámites para expatriados", en: "Expat Paperwork Help" },
  { value: "compras", es: "Compras a domicilio", en: "Grocery Delivery" },
  { value: "house_sitting", es: "Cuidado de casa", en: "House Sitting" },
  { value: "yoga", es: "Yoga / Bienestar", en: "Yoga / Wellness" },
  { value: "diseno", es: "Diseño de interiores", en: "Interior Design" },
  { value: "espanol", es: "Clases de español", en: "Spanish Lessons" },
  { value: "chef", es: "Chef a domicilio", en: "Private Chef" },
  { value: "otro", es: "Otro servicio", en: "Other service" },
] as const;

export function providerServiceLabels(slangs: string[], lang: "es" | "en"): string {
  const labels = slangs
    .map((v) => PROVIDER_SERVICES.find((s) => s.value === v)?.[lang])
    .filter(Boolean) as string[];
  return labels.join(", ");
}

const ALLOWED_SLUGS = new Set<string>(
  PROVIDER_SERVICES.map((s) => s.value as string),
);

/** Alternate categories from signup: valid slugs only, excluding primary service. */
export function sanitizeAlternateServiceSlugs(raw: unknown, primaryService: string): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is string =>
      typeof x === "string" && ALLOWED_SLUGS.has(x) && x !== primaryService,
  );
}

/** Appended to listing descriptions so admin/search store languages, location, and extras. */
export function providerMetaFooters(opts: {
  provider_languages?: string;
  service_location?: string;
  alternate_slugs?: string[];
}): { es: string; en: string } {
  const langOpt = PROVIDER_LANGUAGE_OPTIONS.find((o) => o.value === opts.provider_languages);
  const locOpt = SERVICE_LOCATION_OPTIONS.find((o) => o.value === opts.service_location);
  const slugs = opts.alternate_slugs ?? [];
  const altEs = slugs.length ? providerServiceLabels(slugs, "es") : "";
  const altEn = slugs.length ? providerServiceLabels(slugs, "en") : "";

  const esParts = [
    "---",
    "Perfil de proveedor",
    langOpt ? `Idiomas: ${langOpt.es}` : null,
    locOpt ? `Ubicación del servicio: ${locOpt.es}` : null,
    altEs ? `Otros servicios: ${altEs}` : null,
  ].filter((x): x is string => !!x);

  const enParts = [
    "---",
    "Provider profile",
    langOpt ? `Languages: ${langOpt.en}` : null,
    locOpt ? `Service location: ${locOpt.en}` : null,
    altEn ? `Additional services: ${altEn}` : null,
  ].filter((x): x is string => !!x);

  return {
    es: "\n\n" + esParts.join("\n"),
    en: "\n\n" + enParts.join("\n"),
  };
}
