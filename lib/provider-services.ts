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

/** Primary `PROVIDER_SERVICES` slug for coaching & training signup extras. */
export const COACHING_TRAINING_SERVICE = "coaching_training";

/** Specialties shown when primary service is coaching & training (Únete). */
export const COACHING_TRAINING_FOCUS = [
  { value: "agile", es: "Agile", en: "Agile" },
  { value: "safe", es: "SAFe", en: "SAFe" },
  { value: "ai", es: "IA / AI", en: "AI" },
  { value: "engineering", es: "Ingeniería de software", en: "Software engineering" },
] as const;

/** Delivery modes (virtual / on-site); independent of generic “shop vs client site” location. */
export const COACHING_TRAINING_DELIVERY = [
  { value: "virtual", es: "En línea (virtual)", en: "Online (virtual)" },
  { value: "onsite", es: "Presencial (en sitio)", en: "On-site" },
] as const;

const COACHING_FOCUS_ALLOWED = new Set<string>(COACHING_TRAINING_FOCUS.map((x) => x.value));
const COACHING_DELIVERY_ALLOWED = new Set<string>(COACHING_TRAINING_DELIVERY.map((x) => x.value));

export function coachingFocusLabels(slugs: string[], lang: "es" | "en"): string {
  const labels = slugs
    .map((v) => COACHING_TRAINING_FOCUS.find((s) => s.value === v)?.[lang])
    .filter(Boolean) as string[];
  return labels.join(", ");
}

export function coachingDeliveryLabels(slugs: string[], lang: "es" | "en"): string {
  const labels = slugs
    .map((v) => COACHING_TRAINING_DELIVERY.find((s) => s.value === v)?.[lang])
    .filter(Boolean) as string[];
  return labels.join(", ");
}

export function sanitizeCoachingTrainingFocusSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && COACHING_FOCUS_ALLOWED.has(x)))];
}

export function sanitizeCoachingTrainingDeliverySlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && COACHING_DELIVERY_ALLOWED.has(x)))];
}

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
  { value: "coaching_training", es: "Coaching y capacitación", en: "Coaching & Training" },
  { value: "chef", es: "Chef a domicilio", en: "Private Chef" },
  { value: "servicios_computo", es: "Servicios de cómputo / IT", en: "Computer / IT Services" },
  { value: "veterinaria", es: "Servicios veterinarios", en: "Veterinary Services" },
  { value: "transporte_app", es: "Taxi / transporte por aplicación (tipo Uber / DiDi)", en: "Taxi / ride-hailing (Uber-style)" },
  { value: "arreglos_de_ropa", es: "Arreglos de ropa / costurería", en: "Clothing Alterations / Tailoring" },
  { value: "otro", es: "Otro servicio", en: "Other service" },
] as const;

/** Service slugs that publish a fixed-price menu of sub-items (Phase T1). Drives the
 *  Únete menu-editor and the listing's `service_menu` jsonb column. Keep additive. */
export const TAILORING_SERVICE = "arreglos_de_ropa";
export const VETERINARY_SERVICE = "veterinaria";
export const HOUSEKEEPING_SERVICE = "limpieza";
export const PET_WALKING_SERVICE = "paseador";
export const PET_SITTING_SERVICE = "pet_sitting";
export const DOG_GROOMING_SERVICE = "estetica_canina";
export const TRANSPORT_APP_SERVICE = "transporte_app";
export const BILINGUAL_ERRANDS_SERVICE = "mandados";

export const PET_CARE_SERVICES = new Set<string>([
  PET_WALKING_SERVICE,
  PET_SITTING_SERVICE,
  DOG_GROOMING_SERVICE,
]);

export const PROVIDER_SERVICES_WITH_MENU = new Set<string>([
  TAILORING_SERVICE,
  VETERINARY_SERVICE,
  HOUSEKEEPING_SERVICE,
  PET_WALKING_SERVICE,
  PET_SITTING_SERVICE,
  DOG_GROOMING_SERVICE,
  TRANSPORT_APP_SERVICE,
]);

export function providerServiceSupportsMenu(slug: string | null | undefined): boolean {
  return typeof slug === "string" && PROVIDER_SERVICES_WITH_MENU.has(slug);
}

/** Services where checkout requires buyer accept on provider quote before deposit (Phase H4+). */
export const PROVIDER_SERVICES_WITH_QUOTE_ACCEPT = new Set<string>([
  HOUSEKEEPING_SERVICE,
  VETERINARY_SERVICE,
  PET_WALKING_SERVICE,
  PET_SITTING_SERVICE,
  DOG_GROOMING_SERVICE,
  TRANSPORT_APP_SERVICE,
]);

export function providerServiceRequiresQuoteAccept(slug: string | null | undefined): boolean {
  return typeof slug === "string" && PROVIDER_SERVICES_WITH_QUOTE_ACCEPT.has(slug);
}

/** Deposit + post-completion balance/tip in app (housekeeping, veterinary, pet care). */
export const PROVIDER_SERVICES_WITH_SUPPLEMENT_PAYMENTS = new Set<string>([
  HOUSEKEEPING_SERVICE,
  VETERINARY_SERVICE,
  PET_WALKING_SERVICE,
  PET_SITTING_SERVICE,
  DOG_GROOMING_SERVICE,
  TRANSPORT_APP_SERVICE,
]);

export function providerServiceSupportsSupplementPayments(slug: string | null | undefined): boolean {
  return typeof slug === "string" && PROVIDER_SERVICES_WITH_SUPPLEMENT_PAYMENTS.has(slug);
}

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
  coaching_focus_slugs?: string[];
  coaching_delivery_slugs?: string[];
}): { es: string; en: string } {
  const langOpt = PROVIDER_LANGUAGE_OPTIONS.find((o) => o.value === opts.provider_languages);
  const locOpt = SERVICE_LOCATION_OPTIONS.find((o) => o.value === opts.service_location);
  const slugs = opts.alternate_slugs ?? [];
  const altEs = slugs.length ? providerServiceLabels(slugs, "es") : "";
  const altEn = slugs.length ? providerServiceLabels(slugs, "en") : "";

  const focus = opts.coaching_focus_slugs ?? [];
  const delivery = opts.coaching_delivery_slugs ?? [];
  const focusEs = focus.length ? coachingFocusLabels(focus, "es") : "";
  const focusEn = focus.length ? coachingFocusLabels(focus, "en") : "";
  const delEs = delivery.length ? coachingDeliveryLabels(delivery, "es") : "";
  const delEn = delivery.length ? coachingDeliveryLabels(delivery, "en") : "";

  const esParts = [
    "---",
    "Perfil de proveedor",
    langOpt ? `Idiomas: ${langOpt.es}` : null,
    locOpt ? `Ubicación del servicio: ${locOpt.es}` : null,
    focusEs ? `Capacitación — especialidades: ${focusEs}` : null,
    delEs ? `Capacitación — modalidad: ${delEs}` : null,
    altEs ? `Otros servicios: ${altEs}` : null,
  ].filter((x): x is string => !!x);

  const enParts = [
    "---",
    "Provider profile",
    langOpt ? `Languages: ${langOpt.en}` : null,
    locOpt ? `Service location: ${locOpt.en}` : null,
    focusEn ? `Training — specialties: ${focusEn}` : null,
    delEn ? `Training — delivery: ${delEn}` : null,
    altEn ? `Additional services: ${altEn}` : null,
  ].filter((x): x is string => !!x);

  return {
    es: "\n\n" + esParts.join("\n"),
    en: "\n\n" + enParts.join("\n"),
  };
}
