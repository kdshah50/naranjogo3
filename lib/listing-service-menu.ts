/**
 * Service menu helpers for the tailoring MVP (Phase T1).
 *
 * `listings.service_menu` (jsonb, nullable) carries an optional menu of
 * fixed-price sub-services. When present, the buyer-facing listing page shows
 * the menu, and the seller's chat panel offers a structured quote builder that
 * writes a total into the existing `listing_service_contact_gate.agreed_subtotal_mxn_cents`.
 *
 * Centavos everywhere (consistent with `listings.price_mxn` semantics).
 *
 * IMPORTANT: This module imposes no DB changes beyond the column added by
 * `supabase/migrations/20260518150000_listings_service_menu.sql`. All
 * validation runs in application code so we can return Spanish error messages.
 */

/** Max items in a single menu. Above this, sellers should split into multiple listings. */
export const MAX_SERVICE_MENU_ITEMS = 60;
/** Min price per item (centavos): 1 MXN. */
export const MIN_SERVICE_MENU_ITEM_CENTS = 100;
/** Max price per item (centavos): 50,000 MXN — sanity bound. */
export const MAX_SERVICE_MENU_ITEM_CENTS = 5_000_000;
/** Max chars on item name (each language). */
export const MAX_SERVICE_MENU_NAME_CHARS = 80;
/** Max chars on the disclaimer (each language). */
export const MAX_SERVICE_MENU_DISCLAIMER_CHARS = 240;

export const DEFAULT_INSPECTION_DISCLAIMER_ES =
  "El precio puede ajustarse al revisar la prenda físicamente.";
export const DEFAULT_INSPECTION_DISCLAIMER_EN =
  "Price may change after physical inspection of the garment.";

export const DEFAULT_VET_DISCLAIMER_SPANISH =
  "El precio puede ajustarse después del examen físico y según el peso, edad o condición del paciente.";
export const DEFAULT_VET_DISCLAIMER_EN =
  "Price may change after physical exam and depending on the patient's weight, age, or condition.";

export const DEFAULT_HOUSEKEEPING_DISCLAIMER_ES =
  "El precio puede variar según el estado del hogar, el tamaño real y el acceso. Se confirma en visita o por mensaje.";
export const DEFAULT_HOUSEKEEPING_DISCLAIMER_EN =
  "Price may vary based on home condition, actual size, and access. Confirmed on visit or by message.";

export const DEFAULT_PET_WALKING_DISCLAIMER_ES =
  "El precio puede variar según tamaño, temperamento, distancia y número de perros. Se confirma antes del paseo.";
export const DEFAULT_PET_WALKING_DISCLAIMER_EN =
  "Price may vary by size, temperament, distance, and number of dogs. Confirmed before the walk.";

export const DEFAULT_PET_SITTING_DISCLAIMER_ES =
  "El precio puede variar según especie, número de mascotas, medicación y duración. Se confirma en mensaje o visita.";
export const DEFAULT_PET_SITTING_DISCLAIMER_EN =
  "Price may vary by species, number of pets, medication needs, and duration. Confirmed by message or visit.";

export const DEFAULT_DOG_GROOMING_DISCLAIMER_ES =
  "El precio puede variar según raza, peso, estado del pelaje y comportamiento. Se confirma al revisar a la mascota.";
export const DEFAULT_DOG_GROOMING_DISCLAIMER_EN =
  "Price may vary by breed, weight, coat condition, and behavior. Confirmed when the pet is assessed.";

export const DEFAULT_TAXI_RIDE_DISCLAIMER_ES =
  "El precio puede variar por tráfico, horario, paradas extra o espera adicional. Se confirma en mensaje antes del viaje.";
export const DEFAULT_TAXI_RIDE_DISCLAIMER_EN =
  "Price may vary with traffic, time of day, extra stops, or additional wait time. Confirmed by message before the ride.";

export type ServiceMenuItem = {
  sku: string;
  name_es: string;
  name_en?: string | null;
  price_mxn_cents: number;
};

export type ServiceMenu = {
  version: 1;
  currency: "MXN";
  items: ServiceMenuItem[];
  disclaimer_es?: string | null;
  disclaimer_en?: string | null;
};

export type ParsedServiceMenu =
  | { ok: true; menu: ServiceMenu }
  | { ok: false; error: string };

/** Slugify a free-text name into a deterministic SKU. */
function slugifyName(input: string, fallback: string): string {
  const slug = String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

/**
 * Normalize and validate a service menu coming from the API, the database, or
 * the SellModal client form. Returns a clean, deduped menu or an error string.
 *
 * Accepts both centavos (`price_mxn_cents`) and pesos (`price_mxn`) on input
 * — the latter exists so the SellModal can pass user-typed pesos directly
 * without a conversion step. Output is always centavos.
 */
export function parseServiceMenu(input: unknown): ParsedServiceMenu {
  if (input == null) return { ok: true, menu: emptyMenu() };

  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Menú inválido (debe ser un objeto)" };
  }

  const raw = input as Record<string, unknown>;
  const itemsRaw = raw.items;
  if (itemsRaw != null && !Array.isArray(itemsRaw)) {
    return { ok: false, error: "Menú inválido (items debe ser una lista)" };
  }

  const list = Array.isArray(itemsRaw) ? itemsRaw : [];
  if (list.length > MAX_SERVICE_MENU_ITEMS) {
    return {
      ok: false,
      error: `Demasiados servicios en el menú (máximo ${MAX_SERVICE_MENU_ITEMS})`,
    };
  }

  const seenSkus = new Set<string>();
  const items: ServiceMenuItem[] = [];

  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (typeof it !== "object" || it == null) {
      return { ok: false, error: `Fila ${i + 1}: formato inválido` };
    }
    const row = it as Record<string, unknown>;

    const name_es = String(row.name_es ?? row.name ?? "").trim();
    if (!name_es) {
      return { ok: false, error: `Fila ${i + 1}: el nombre es obligatorio` };
    }
    if (name_es.length > MAX_SERVICE_MENU_NAME_CHARS) {
      return {
        ok: false,
        error: `Fila ${i + 1}: nombre demasiado largo (máx ${MAX_SERVICE_MENU_NAME_CHARS} caracteres)`,
      };
    }

    const name_en_raw = row.name_en;
    const name_en =
      typeof name_en_raw === "string" && name_en_raw.trim()
        ? name_en_raw.trim().slice(0, MAX_SERVICE_MENU_NAME_CHARS)
        : null;

    // Accept either centavos (canonical) or pesos (convenience for the form).
    let cents: number | null = null;
    if (row.price_mxn_cents != null) {
      cents = Math.round(Number(row.price_mxn_cents));
    } else if (row.price_mxn != null) {
      cents = Math.round(Number(row.price_mxn) * 100);
    }
    if (cents == null || !Number.isFinite(cents)) {
      return { ok: false, error: `Fila ${i + 1}: precio inválido` };
    }
    if (cents < MIN_SERVICE_MENU_ITEM_CENTS) {
      return {
        ok: false,
        error: `Fila ${i + 1}: precio mínimo $${MIN_SERVICE_MENU_ITEM_CENTS / 100} MXN`,
      };
    }
    if (cents > MAX_SERVICE_MENU_ITEM_CENTS) {
      return {
        ok: false,
        error: `Fila ${i + 1}: precio máximo $${(MAX_SERVICE_MENU_ITEM_CENTS / 100).toLocaleString("es-MX")} MXN`,
      };
    }

    let sku = String(row.sku ?? "").trim().toLowerCase();
    if (!sku) sku = slugifyName(name_es, `item_${i + 1}`);
    if (sku.length > 50) sku = sku.slice(0, 50);
    if (seenSkus.has(sku)) {
      // Deterministic disambiguation: append index.
      sku = `${sku}_${i + 1}`.slice(0, 50);
    }
    seenSkus.add(sku);

    items.push({
      sku,
      name_es,
      name_en,
      price_mxn_cents: cents,
    });
  }

  const disclaimer_es = pickDisclaimer(raw.disclaimer_es, DEFAULT_INSPECTION_DISCLAIMER_ES);
  const disclaimer_en = pickDisclaimer(raw.disclaimer_en, DEFAULT_INSPECTION_DISCLAIMER_EN);

  return {
    ok: true,
    menu: {
      version: 1,
      currency: "MXN",
      items,
      disclaimer_es,
      disclaimer_en,
    },
  };
}

function pickDisclaimer(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_SERVICE_MENU_DISCLAIMER_CHARS);
}

export function emptyMenu(): ServiceMenu {
  return {
    version: 1,
    currency: "MXN",
    items: [],
    disclaimer_es: DEFAULT_INSPECTION_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_INSPECTION_DISCLAIMER_EN,
  };
}

export function hasServiceMenu(menu: ServiceMenu | null | undefined): menu is ServiceMenu {
  return Boolean(menu && Array.isArray(menu.items) && menu.items.length > 0);
}

/** Listing menu when set; otherwise starter template for quote-gated provider slugs. */
export function effectiveServiceMenuForListing(
  menu: ServiceMenu | null | undefined,
  providerSlug: string | null | undefined,
): ServiceMenu | null {
  // Column explicitly set (including empty items: []) — honor DB; do not resurrect starter.
  if (menu !== null && menu !== undefined) {
    return hasServiceMenu(menu) ? menu : null;
  }
  const starter = starterMenuForProviderSlug(providerSlug);
  return hasServiceMenu(starter) ? starter : null;
}

/** Parse listing menu jsonb or fall back to provider starter template (quote-gated slugs). */
export function resolveListingServiceMenu(
  raw: unknown,
  providerSlug: string | null | undefined,
): ParsedServiceMenu {
  if (raw === null || raw === undefined) {
    const starter = starterMenuForProviderSlug(providerSlug);
    if (hasServiceMenu(starter)) return { ok: true, menu: starter };
    return { ok: true, menu: emptyMenu() };
  }
  const parsed = parseServiceMenu(raw);
  if (!parsed.ok) return parsed;
  return parsed;
}

export type ServiceMenuFormRow = { name_es: string; name_en: string; pesos: string };

export function emptyServiceMenuFormRow(): ServiceMenuFormRow {
  return { name_es: "", name_en: "", pesos: "" };
}

function normalizeMenuNameKey(input: string): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Backfill missing English labels from the provider starter template (by Spanish name or price). */
export function enrichFormRowsFromStarter(
  rows: ServiceMenuFormRow[],
  providerSlug: string | null | undefined,
): ServiceMenuFormRow[] {
  const starter = starterMenuForProviderSlug(providerSlug);
  if (!starter?.items?.length) return rows;

  const byNameEs = new Map<string, ServiceMenuItem>();
  const byPrice = new Map<number, ServiceMenuItem[]>();
  for (const it of starter.items) {
    byNameEs.set(normalizeMenuNameKey(it.name_es), it);
    const bucket = byPrice.get(it.price_mxn_cents) ?? [];
    bucket.push(it);
    byPrice.set(it.price_mxn_cents, bucket);
  }

  return rows.map((row) => {
    if (row.name_en.trim()) return row;
    const nameKey = normalizeMenuNameKey(row.name_es);
    let match = byNameEs.get(nameKey);
    if (!match) {
      const pesos = Number(String(row.pesos).trim().replace(/,/g, "."));
      if (Number.isFinite(pesos) && pesos > 0) {
        const cents = Math.round(pesos * 100);
        const candidates = byPrice.get(cents) ?? [];
        match =
          candidates.find((c) => normalizeMenuNameKey(c.name_es) === nameKey) ??
          (candidates.length === 1 ? candidates[0] : undefined);
      }
    }
    if (match?.name_en) {
      return { ...row, name_en: match.name_en };
    }
    return row;
  });
}

/** Form rows for the menu editor UI (signup, profile, admin). */
export function serviceMenuFormRowsFromMenu(
  menu: ServiceMenu | null | undefined,
): ServiceMenuFormRow[] {
  if (!menu?.items?.length) return [];
  return menu.items.map((it) => ({
    name_es: it.name_es,
    name_en: it.name_en ?? "",
    pesos: String(it.price_mxn_cents / 100),
  }));
}

/** Form rows for the menu editor UI (signup, profile, admin). When DB menu is unset, show starter (matches public page). */
export function editorMenuRowsFromListing(
  raw: ServiceMenu | null | undefined,
  providerSlug: string | null | undefined,
): ServiceMenuFormRow[] {
  let rows: ServiceMenuFormRow[];
  if (raw != null) {
    const parsed = parseServiceMenu(raw);
    rows = serviceMenuFormRowsFromMenu(parsed.ok ? parsed.menu : null);
  } else {
    rows = serviceMenuFormRowsFromMenu(starterMenuForProviderSlug(providerSlug));
  }
  return enrichFormRowsFromStarter(rows, providerSlug);
}

/** Normalize PATCH/admin body into a menu row ready for DB (never null — empty menus stay explicit). */
export function serviceMenuForListingPatch(
  raw: unknown,
  providerSlug: string | null | undefined,
): ParsedServiceMenu {
  const parsed =
    raw === null || raw === undefined
      ? parseServiceMenu(serviceMenuPayloadFromFormRows([], providerSlug))
      : parseServiceMenu(raw);
  if (!parsed.ok) return parsed;
  const disclaimers = menuDisclaimersForProviderSlug(providerSlug);
  return {
    ok: true,
    menu: {
      ...parsed.menu,
      disclaimer_es: disclaimers.disclaimer_es,
      disclaimer_en: disclaimers.disclaimer_en,
    },
  };
}

/** Build API payload from editor rows + provider slug (disclaimers from slug). */
export function serviceMenuPayloadFromFormRows(
  rows: ServiceMenuFormRow[],
  providerSlug: string | null | undefined,
): ServiceMenu | Record<string, unknown> {
  const disclaimers = menuDisclaimersForProviderSlug(providerSlug);
  const cleaned = enrichFormRowsFromStarter(rows, providerSlug)
    .map((r) => ({
      name_es: r.name_es.trim(),
      name_en: r.name_en.trim(),
      pesos: Number(String(r.pesos).trim().replace(/,/g, ".")),
    }))
    .filter((r) => r.name_es.length > 0 && Number.isFinite(r.pesos) && r.pesos > 0)
    .map((r) => ({
      name_es: r.name_es,
      ...(r.name_en ? { name_en: r.name_en } : {}),
      price_mxn: r.pesos,
    }));
  if (cleaned.length === 0) {
    return {
      version: 1,
      currency: "MXN",
      items: [],
      ...disclaimers,
    };
  }
  return { items: cleaned, ...disclaimers };
}

/** Quick room-type qty controls for housekeeping quote builder (maps to menu SKUs). */
export const HOUSEKEEPING_QUICK_QUOTE_GROUPS: {
  sku: string;
  label_es: string;
  label_en: string;
  /** When qty > 0, also set this SKU to 1 (e.g. base clean once per quote). */
  alsoSetSku?: string;
}[] = [
  { sku: "std_bedroom_add", label_es: "Recámaras extra (estándar)", label_en: "Extra bedrooms (standard)", alsoSetSku: "std_base_1bed" },
  { sku: "deep_bedroom_add", label_es: "Recámaras extra (profunda)", label_en: "Extra bedrooms (deep)", alsoSetSku: "deep_base_1bed" },
  { sku: "std_bathroom", label_es: "Baños (estándar)", label_en: "Bathrooms (standard)" },
  { sku: "deep_bathroom", label_es: "Baños (profunda)", label_en: "Bathrooms (deep)" },
  { sku: "std_kitchen", label_es: "Cocina (estándar)", label_en: "Kitchen (standard)" },
  { sku: "deep_kitchen", label_es: "Cocina (profunda)", label_en: "Kitchen (deep)" },
  { sku: "std_living", label_es: "Sala / comedor (estándar)", label_en: "Living / dining (standard)" },
  { sku: "deep_living", label_es: "Sala / comedor (profunda)", label_en: "Living / dining (deep)" },
  { sku: "laundry_small", label_es: "Lavado ropa (carga pequeña)", label_en: "Laundry (small load)" },
  { sku: "laundry_large", label_es: "Lavado ropa (carga grande)", label_en: "Laundry (large load)" },
];

/** Visit frequency for recurring housekeeping quotes (menu prices = per visit). */
export type HousekeepingVisitFrequency =
  | "one_time"
  | "daily"
  | "weekly"
  | "twice_weekly"
  | "monthly";

export const HOUSEKEEPING_VISIT_FREQUENCIES: {
  id: HousekeepingVisitFrequency;
  label_es: string;
  label_en: string;
  /** Visits in a typical month — used to estimate monthly total from per-visit menu prices. */
  visitsPerMonth: number;
}[] = [
  { id: "one_time", label_es: "Única visita", label_en: "One-time visit", visitsPerMonth: 1 },
  { id: "daily", label_es: "Diario (~26 visitas/mes)", label_en: "Daily (~26 visits/month)", visitsPerMonth: 26 },
  { id: "weekly", label_es: "Semanal (4 visitas/mes)", label_en: "Weekly (4 visits/month)", visitsPerMonth: 4 },
  {
    id: "twice_weekly",
    label_es: "2× por semana (8 visitas/mes)",
    label_en: "Twice a week (8 visits/month)",
    visitsPerMonth: 8,
  },
  { id: "monthly", label_es: "Mensual (1 visita/mes)", label_en: "Monthly (1 visit/month)", visitsPerMonth: 1 },
];

export function housekeepingVisitsPerMonth(
  frequency: HousekeepingVisitFrequency,
): number {
  const row = HOUSEKEEPING_VISIT_FREQUENCIES.find((f) => f.id === frequency);
  return row?.visitsPerMonth ?? 1;
}

export type HousekeepingQuoteTotals = {
  perVisitCents: number;
  /** Per visit × visits/month (same as perVisit when frequency is one_time). */
  monthlyPackageCents: number;
  visitsPerMonth: number;
  frequency: HousekeepingVisitFrequency;
};

export type HousekeepingQuoteBasis = "per_visit" | "monthly_package";

/** Which amount to put in agreed price for a housekeeping quote. */
export function housekeepingAgreedPriceCents(
  totals: HousekeepingQuoteTotals,
  basis: HousekeepingQuoteBasis,
): number {
  if (basis === "monthly_package" && totals.frequency !== "one_time") {
    return totals.monthlyPackageCents;
  }
  return totals.perVisitCents;
}

/** Per-visit subtotal from menu cart, with recurring monthly package estimate. */
export function computeHousekeepingQuoteTotals(
  menu: ServiceMenu | null | undefined,
  cart: ServiceMenuQuoteLine[],
  frequency: HousekeepingVisitFrequency = "one_time",
): HousekeepingQuoteTotals {
  const perVisitCents = computeServiceMenuQuoteCents(menu, cart);
  const visitsPerMonth = housekeepingVisitsPerMonth(frequency);
  const monthlyPackageCents = Math.round(perVisitCents * visitsPerMonth);
  return {
    perVisitCents,
    monthlyPackageCents,
    visitsPerMonth,
    frequency,
  };
}

export type ServiceMenuQuoteLine = {
  sku: string;
  qty: number;
};

/** Compute the total in centavos for a (menu, quote-cart) pair. Unknown SKUs are silently skipped. */
export function computeServiceMenuQuoteCents(
  menu: ServiceMenu | null | undefined,
  cart: ServiceMenuQuoteLine[]
): number {
  if (!menu || !Array.isArray(menu.items)) return 0;
  const priceBySku = new Map<string, number>();
  for (const it of menu.items) {
    priceBySku.set(it.sku, it.price_mxn_cents);
  }
  let total = 0;
  for (const line of cart) {
    const sku = String(line.sku ?? "").trim();
    const qty = Math.max(0, Math.floor(Number(line.qty ?? 0)));
    const price = priceBySku.get(sku);
    if (!price || qty <= 0) continue;
    total += price * qty;
  }
  return Math.round(total);
}

/**
 * Pre-filled starter menu for tailoring (Mexico, neighborhood-shop tier).
 * Sellers can edit prices or delete rows before publishing. Mid-of-range prices.
 */
export function tailoringStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    { sku: "hem_basic",       name_es: "Dobladillo pantalón básico",       name_en: "Pants hem (basic)",       price_mxn_cents: 5000 },
    { sku: "hem_jeans",       name_es: "Dobladillo de mezclilla (jeans)",  name_en: "Jeans hem",               price_mxn_cents: 7000 },
    { sku: "hem_skirt",       name_es: "Dobladillo de falda",              name_en: "Skirt hem",               price_mxn_cents: 7000 },
    { sku: "hem_dress",       name_es: "Dobladillo de vestido casual",     name_en: "Casual dress hem",        price_mxn_cents: 10000 },
    { sku: "zipper_pants",    name_es: "Cierre de pantalón",               name_en: "Pants zipper",            price_mxn_cents: 10000 },
    { sku: "zipper_skirt",    name_es: "Cierre de falda/vestido",          name_en: "Skirt/dress zipper",      price_mxn_cents: 12000 },
    { sku: "zipper_jacket",   name_es: "Cierre de chamarra",               name_en: "Jacket zipper",           price_mxn_cents: 20000 },
    { sku: "button_sew",      name_es: "Pegar botón (por pieza)",          name_en: "Sew on button (each)",    price_mxn_cents: 1200 },
    { sku: "button_replace",  name_es: "Cambio de botón completo",         name_en: "Replace full button set", price_mxn_cents: 2000 },
    { sku: "waist_in",        name_es: "Entallar cintura pantalón",        name_en: "Take in pants waist",     price_mxn_cents: 10000 },
    { sku: "shirt_sides",     name_es: "Entallar costados blusa/camisa",   name_en: "Take in shirt sides",     price_mxn_cents: 12000 },
    { sku: "dress_in",        name_es: "Entallar vestido",                 name_en: "Take in dress",           price_mxn_cents: 20000 },
    { sku: "sleeves_shirt",   name_es: "Acortar mangas camisa",            name_en: "Shorten shirt sleeves",   price_mxn_cents: 10000 },
    { sku: "sleeves_jacket",  name_es: "Acortar mangas saco (con puño)",   name_en: "Shorten jacket sleeves",  price_mxn_cents: 18000 },
    { sku: "patch_small",     name_es: "Parche / agujero pequeño",         name_en: "Small patch",             price_mxn_cents: 5000 },
    { sku: "mend_tear",       name_es: "Zurcir rasgadura",                 name_en: "Mend a tear",             price_mxn_cents: 6000 },
    { sku: "seam_reinforce",  name_es: "Reforzar costura",                 name_en: "Reinforce seam",          price_mxn_cents: 4000 },
    { sku: "elastic_waist",   name_es: "Cambio de resorte de cintura",     name_en: "Replace waistband elastic", price_mxn_cents: 8000 },
    { sku: "elastic_cuff",    name_es: "Resorte de puño",                  name_en: "Cuff elastic",            price_mxn_cents: 5000 },
    { sku: "pickup",          name_es: "Recolección y entrega a domicilio", name_en: "Pickup & delivery",      price_mxn_cents: 5000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_INSPECTION_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_INSPECTION_DISCLAIMER_EN,
  };
}

/**
 * Pre-filled starter menu for veterinary clinics (Mexico, neighborhood tier).
 */
export function veterinaryStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    // Primary / general care
    { sku: "wellness_annual", name_es: "Chequeo anual / wellness", name_en: "Annual wellness exam", price_mxn_cents: 45000 },
    { sku: "consult_general", name_es: "Consulta general (perro/gato)", name_en: "General exam (dog/cat)", price_mxn_cents: 35000 },
    { sku: "consult_puppy", name_es: "Consulta cachorro / kitten", name_en: "Puppy/kitten exam", price_mxn_cents: 40000 },
    { sku: "consult_followup", name_es: "Consulta de seguimiento", name_en: "Follow-up visit", price_mxn_cents: 25000 },
    { sku: "consult_exotic", name_es: "Consulta animales exóticos (aves, reptiles, conejos)", name_en: "Exotic animal exam (birds, reptiles, rabbits)", price_mxn_cents: 55000 },
    { sku: "vaccine_rabies_dog", name_es: "Vacuna antirrábica (perro)", name_en: "Rabies vaccine (dog)", price_mxn_cents: 28000 },
    { sku: "vaccine_rabies_cat", name_es: "Vacuna antirrábica (gato)", name_en: "Rabies vaccine (cat)", price_mxn_cents: 28000 },
    { sku: "vaccine_quintuple", name_es: "Vacuna múltiple perro (quintuple)", name_en: "Dog multivalent vaccine", price_mxn_cents: 45000 },
    { sku: "vaccine_triple_felina", name_es: "Vacuna triple felina", name_en: "Feline triple vaccine", price_mxn_cents: 42000 },
    { sku: "deworm_oral", name_es: "Desparasitación oral", name_en: "Oral deworming", price_mxn_cents: 18000 },
    { sku: "deworm_inject", name_es: "Desparasitación inyectable", name_en: "Injectable deworming", price_mxn_cents: 22000 },
    { sku: "flea_tick_prevention", name_es: "Prevención pulgas y garrapatas", name_en: "Flea and tick prevention", price_mxn_cents: 35000 },
    { sku: "spay_neuter", name_es: "Esterilización / castración (perro o gato)", name_en: "Spay/neuter (dog or cat)", price_mxn_cents: 220000 },
    { sku: "chip_id", name_es: "Microchip + registro", name_en: "Microchip + registration", price_mxn_cents: 65000 },
    { sku: "nutrition_consult", name_es: "Asesoría nutricional", name_en: "Nutrition counseling", price_mxn_cents: 30000 },
    { sku: "home_visit_fee", name_es: "Consulta / visita a domicilio (zona local)", name_en: "Home visit (local zone)", price_mxn_cents: 30000 },
    // Diagnostic
    { sku: "blood_panel_basic", name_es: "Química sanguínea básica", name_en: "Basic blood panel", price_mxn_cents: 90000 },
    { sku: "urinalysis", name_es: "Examen general de orina", name_en: "Urinalysis", price_mxn_cents: 35000 },
    { sku: "inhouse_lab_panel", name_es: "Panel de laboratorio en consultorio", name_en: "In-house lab panel", price_mxn_cents: 65000 },
    { sku: "xray", name_es: "Rayos X (radiografía digital)", name_en: "X-ray (digital radiology)", price_mxn_cents: 80000 },
    { sku: "ultrasound", name_es: "Ultrasonido", name_en: "Ultrasound imaging", price_mxn_cents: 120000 },
    { sku: "fluid_subq", name_es: "Fluidos subcutáneos", name_en: "Subcutaneous fluids", price_mxn_cents: 40000 },
    // Hospitalization & surgery
    { sku: "hospitalization_day", name_es: "Hospitalización (por día)", name_en: "Hospitalization (per day)", price_mxn_cents: 80000 },
    { sku: "soft_tissue_surgery", name_es: "Cirugía de tejidos blandos (referencia)", name_en: "Soft tissue surgery (reference)", price_mxn_cents: 350000 },
    { sku: "surgery_ortho_consult", name_es: "Valoración ortopedia / traumatología", name_en: "Orthopedic evaluation", price_mxn_cents: 45000 },
    // Dental
    { sku: "dental_cleaning", name_es: "Limpieza y profilaxis dental", name_en: "Professional dental cleaning", price_mxn_cents: 150000 },
    { sku: "dental_extraction", name_es: "Extracción dental", name_en: "Tooth extraction", price_mxn_cents: 80000 },
    { sku: "dental_xray", name_es: "Radiografía dental", name_en: "Dental X-ray", price_mxn_cents: 60000 },
    // Minor care & admin
    { sku: "nail_trim", name_es: "Corte de uñas", name_en: "Nail trim", price_mxn_cents: 12000 },
    { sku: "ear_clean", name_es: "Limpieza de oídos", name_en: "Ear cleaning", price_mxn_cents: 15000 },
    { sku: "emergency_surcharge", name_es: "Urgencia / cirugía de emergencia (recargo)", name_en: "Emergency / after-hours surcharge", price_mxn_cents: 50000 },
    { sku: "cert_travel", name_es: "Certificado de salud para viaje", name_en: "Travel health certificate", price_mxn_cents: 55000 },
    // End-of-life
    { sku: "euthanasia_consult", name_es: "Consulta valoración eutanasia", name_en: "Euthanasia consultation", price_mxn_cents: 60000 },
    { sku: "euthanasia_procedure", name_es: "Eutanasia humanitaria", name_en: "Humane euthanasia", price_mxn_cents: 150000 },
    { sku: "cremation_pet", name_es: "Cremación de mascotas", name_en: "Pet cremation", price_mxn_cents: 200000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_VET_DISCLAIMER_SPANISH,
    disclaimer_en: DEFAULT_VET_DISCLAIMER_EN,
  };
}

/**
 * Pre-filled starter menu for home cleaning / housekeeping (Mexico, neighborhood tier).
 * Line-item model: standard vs deep per room, laundry, specials. Editable before publish.
 */
export function housekeepingStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    // Standard / deep — base & bedrooms
    { sku: "std_base_1bed", name_es: "Limpieza estándar base (hasta 1 recámara)", name_en: "Standard clean base (up to 1 bedroom)", price_mxn_cents: 45000 },
    { sku: "std_bedroom_add", name_es: "Recámara adicional (estándar)", name_en: "Additional bedroom (standard)", price_mxn_cents: 12000 },
    { sku: "deep_base_1bed", name_es: "Limpieza profunda base (hasta 1 recámara)", name_en: "Deep clean base (up to 1 bedroom)", price_mxn_cents: 95000 },
    { sku: "deep_bedroom_add", name_es: "Recámara adicional (profunda)", name_en: "Additional bedroom (deep)", price_mxn_cents: 20000 },
    // Bathrooms
    { sku: "std_bathroom", name_es: "Baño (estándar)", name_en: "Bathroom (standard)", price_mxn_cents: 15000 },
    { sku: "deep_bathroom", name_es: "Baño (profunda)", name_en: "Bathroom (deep)", price_mxn_cents: 28000 },
    // Kitchen
    { sku: "std_kitchen", name_es: "Cocina (estándar)", name_en: "Kitchen (standard)", price_mxn_cents: 18000 },
    { sku: "deep_kitchen", name_es: "Cocina (profunda)", name_en: "Kitchen (deep)", price_mxn_cents: 35000 },
    // Living / family / other rooms
    { sku: "std_living", name_es: "Sala / comedor (estándar)", name_en: "Living / dining room (standard)", price_mxn_cents: 15000 },
    { sku: "deep_living", name_es: "Sala / comedor (profunda)", name_en: "Living / dining room (deep)", price_mxn_cents: 25000 },
    { sku: "std_family", name_es: "Cuarto familiar / estudio (estándar)", name_en: "Family room / study (standard)", price_mxn_cents: 12000 },
    { sku: "deep_family", name_es: "Cuarto familiar / estudio (profunda)", name_en: "Family room / study (deep)", price_mxn_cents: 22000 },
    { sku: "std_other_room", name_es: "Otro cuarto / oficina (estándar)", name_en: "Other room / office (standard)", price_mxn_cents: 12000 },
    { sku: "deep_other_room", name_es: "Otro cuarto / oficina (profunda)", name_en: "Other room / office (deep)", price_mxn_cents: 22000 },
    // Laundry & clothes
    { sku: "laundry_small", name_es: "Lavado de ropa (carga pequeña)", name_en: "Laundry (small load)", price_mxn_cents: 10000 },
    { sku: "laundry_large", name_es: "Lavado de ropa (carga grande)", name_en: "Laundry (large load)", price_mxn_cents: 18000 },
    { sku: "folding_clothes", name_es: "Doblar y guardar ropa", name_en: "Fold and put away laundry", price_mxn_cents: 8000 },
    { sku: "ironing_hour", name_es: "Planchado (por hora)", name_en: "Ironing (per hour)", price_mxn_cents: 12000 },
    // Special surfaces & appliances
    { sku: "windows_each", name_es: "Ventanas (por ventana)", name_en: "Windows (each)", price_mxn_cents: 6000 },
    { sku: "fridge_interior", name_es: "Interior de refrigerador", name_en: "Refrigerator interior", price_mxn_cents: 15000 },
    { sku: "oven_stove", name_es: "Horno y estufa", name_en: "Oven and stovetop", price_mxn_cents: 18000 },
    { sku: "cabinets_interior", name_es: "Interior de gabinetes (cocina)", name_en: "Cabinet interiors (kitchen)", price_mxn_cents: 20000 },
    { sku: "baseboards", name_es: "Zoclos, marcos y polvo alto", name_en: "Baseboards, frames, high dusting", price_mxn_cents: 12000 },
    { sku: "blinds_dust", name_es: "Persianas / lamas", name_en: "Blinds / slats", price_mxn_cents: 10000 },
    { sku: "upholstery_sofa", name_es: "Sofá (aspirado / superficie)", name_en: "Sofa (vacuum / surface)", price_mxn_cents: 20000 },
    { sku: "balcony_patio", name_es: "Balcón / patio (estándar)", name_en: "Balcony / patio (standard)", price_mxn_cents: 15000 },
    // Special jobs
    { sku: "move_out", name_es: "Limpieza post-mudanza / entrega de llaves", name_en: "Move-out / key handover clean", price_mxn_cents: 180000 },
    { sku: "post_construction", name_es: "Limpieza post-obra (referencia)", name_en: "Post-construction clean (reference)", price_mxn_cents: 250000 },
    { sku: "disinfection", name_es: "Desinfección / sanitización", name_en: "Disinfection / sanitization", price_mxn_cents: 80000 },
    { sku: "pet_hair_surcharge", name_es: "Recargo pelo de mascotas", name_en: "Pet hair surcharge", price_mxn_cents: 15000 },
    // Supplies & logistics
    { sku: "supplies_included", name_es: "Productos de limpieza incluidos", name_en: "Cleaning supplies included", price_mxn_cents: 8000 },
    { sku: "travel_fee", name_es: "Visita fuera de zona / traslado", name_en: "Out-of-zone visit / travel fee", price_mxn_cents: 15000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_HOUSEKEEPING_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_HOUSEKEEPING_DISCLAIMER_EN,
  };
}

/** Pre-filled starter menu for dog walking (Mexico, neighborhood tier). */
export function dogWalkingStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    { sku: "walk_30", name_es: "Paseo 30 minutos", name_en: "30-minute walk", price_mxn_cents: 15000 },
    { sku: "walk_45", name_es: "Paseo 45 minutos", name_en: "45-minute walk", price_mxn_cents: 20000 },
    { sku: "walk_60", name_es: "Paseo 60 minutos", name_en: "60-minute walk", price_mxn_cents: 25000 },
    { sku: "walk_extra_dog", name_es: "Perro adicional (mismo paseo)", name_en: "Additional dog (same walk)", price_mxn_cents: 8000 },
    { sku: "walk_puppy", name_es: "Paseo cachorro (20 min)", name_en: "Puppy walk (20 min)", price_mxn_cents: 12000 },
    { sku: "walk_group", name_es: "Paseo grupal (por perro)", name_en: "Group walk (per dog)", price_mxn_cents: 12000 },
    { sku: "walk_weekend", name_es: "Recargo fin de semana / festivo", name_en: "Weekend / holiday surcharge", price_mxn_cents: 5000 },
    { sku: "walk_pickup", name_es: "Recogida y entrega a domicilio", name_en: "Home pickup and drop-off", price_mxn_cents: 8000 },
    { sku: "walk_park_visit", name_es: "Visita al parque (60 min)", name_en: "Dog park visit (60 min)", price_mxn_cents: 28000 },
    { sku: "walk_weekly_5", name_es: "Paquete 5 paseos / semana", name_en: "5 walks per week package", price_mxn_cents: 110000 },
    { sku: "walk_medication", name_es: "Administración de medicamento en paseo", name_en: "Medication during walk", price_mxn_cents: 5000 },
    { sku: "walk_photo_update", name_es: "Reporte con fotos en WhatsApp", name_en: "Photo update via WhatsApp", price_mxn_cents: 0 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_PET_WALKING_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_PET_WALKING_DISCLAIMER_EN,
  };
}

/** Pre-filled starter menu for pet sitting / boarding. */
export function petSittingStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    { sku: "visit_30", name_es: "Visita de chequeo (30 min)", name_en: "Check-in visit (30 min)", price_mxn_cents: 18000 },
    { sku: "visit_60", name_es: "Visita extendida (60 min)", name_en: "Extended visit (60 min)", price_mxn_cents: 28000 },
    { sku: "sit_half_day", name_es: "Cuidado medio día (4 h)", name_en: "Half-day sitting (4 h)", price_mxn_cents: 45000 },
    { sku: "sit_full_day", name_es: "Cuidado día completo (8 h)", name_en: "Full-day sitting (8 h)", price_mxn_cents: 75000 },
    { sku: "sit_overnight_home", name_es: "Noche en casa del cliente", name_en: "Overnight at client's home", price_mxn_cents: 90000 },
    { sku: "board_per_night", name_es: "Hospedaje por noche (casa del cuidador)", name_en: "Boarding per night (sitter's home)", price_mxn_cents: 85000 },
    { sku: "sit_extra_pet", name_es: "Mascota adicional", name_en: "Additional pet", price_mxn_cents: 15000 },
    { sku: "sit_medication", name_es: "Administración de medicamento", name_en: "Medication administration", price_mxn_cents: 8000 },
    { sku: "sit_holiday", name_es: "Recargo temporada alta / festivo", name_en: "Peak season / holiday surcharge", price_mxn_cents: 20000 },
    { sku: "sit_plants_mail", name_es: "Plantas / correo / llaves extra", name_en: "Plants / mail / keys check", price_mxn_cents: 10000 },
    { sku: "sit_cat_only", name_es: "Visita solo gato (30 min)", name_en: "Cat-only visit (30 min)", price_mxn_cents: 20000 },
    { sku: "sit_exotic", name_es: "Cuidado animales exóticos (referencia)", name_en: "Exotic pet care (reference)", price_mxn_cents: 55000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_PET_SITTING_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_PET_SITTING_DISCLAIMER_EN,
  };
}

/** Pre-filled starter menu for dog grooming / estética canina. */
export function dogGroomingStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    { sku: "bath_small", name_es: "Baño perro pequeño (hasta 10 kg)", name_en: "Bath small dog (up to 10 kg)", price_mxn_cents: 35000 },
    { sku: "bath_medium", name_es: "Baño perro mediano (10–25 kg)", name_en: "Bath medium dog (10–25 kg)", price_mxn_cents: 45000 },
    { sku: "bath_large", name_es: "Baño perro grande (25+ kg)", name_en: "Bath large dog (25+ kg)", price_mxn_cents: 60000 },
    { sku: "groom_full_small", name_es: "Estética completa perro pequeño", name_en: "Full groom small dog", price_mxn_cents: 55000 },
    { sku: "groom_full_medium", name_es: "Estética completa perro mediano", name_en: "Full groom medium dog", price_mxn_cents: 75000 },
    { sku: "groom_full_large", name_es: "Estética completa perro grande", name_en: "Full groom large dog", price_mxn_cents: 95000 },
    { sku: "nail_trim", name_es: "Corte de uñas", name_en: "Nail trim", price_mxn_cents: 12000 },
    { sku: "ear_clean", name_es: "Limpieza de oídos", name_en: "Ear cleaning", price_mxn_cents: 15000 },
    { sku: "deshedding", name_es: "Deslanado / cardado", name_en: "Deshedding / brushing", price_mxn_cents: 25000 },
    { sku: "dental_cleaning", name_es: "Limpieza dental", name_en: "Dental cleaning", price_mxn_cents: 5000 },
    {
      sku: "teeth_brush",
      name_es:
        "Cepillado dental (dejamos pasta y cepillo contigo; visitas siguientes solo limpieza $50)",
      name_en:
        "Teeth brushing (toothpaste & brush left with you; follow-up visits: cleaning only $50)",
      price_mxn_cents: 25000,
    },
    {
      sku: "paw_nose_moisturizing",
      name_es: "Hidratación de almohadillas y nariz",
      name_en: "Paw pad and nose moisturizing",
      price_mxn_cents: 5000,
    },
    {
      sku: "flea_treatment_290",
      name_es: "Tratamiento antipulgas",
      name_en: "Flea treatment",
      price_mxn_cents: 29000,
    },
    {
      sku: "flea_treatment_350",
      name_es: "Tratamiento antipulgas (alternativa)",
      name_en: "Flea treatment (alternate)",
      price_mxn_cents: 35000,
    },
    { sku: "flea_bath", name_es: "Baño antipulgas", name_en: "Flea bath", price_mxn_cents: 10000 },
    {
      sku: "derm_bath",
      name_es: "Baño dermatológico",
      name_en: "Dermatological bath",
      price_mxn_cents: 10000,
    },
    {
      sku: "derm_shampoo",
      name_es: "Shampoo dermatológico",
      name_en: "Dermatological shampoo",
      price_mxn_cents: 49000,
    },
    {
      sku: "coat_shampoo_color",
      name_es: "Shampoo pelaje blanco, negro o dorado",
      name_en: "Shampoo for white, black, or golden coats",
      price_mxn_cents: 35000,
    },
    {
      sku: "collagen_small",
      name_es: "Colágeno raza pequeña (firmeza, elasticidad y textura del pelaje)",
      name_en: "Collagen small breed (adds firmness, elasticity, body, and coat texture)",
      price_mxn_cents: 8000,
    },
    {
      sku: "collagen_medium",
      name_es: "Colágeno raza mediana (firmeza, elasticidad y textura del pelaje)",
      name_en: "Collagen medium breed (adds firmness, elasticity, body, and coat texture)",
      price_mxn_cents: 10000,
    },
    {
      sku: "collagen_large",
      name_es: "Colágeno raza grande (firmeza, elasticidad y textura del pelaje)",
      name_en: "Collagen large breed (adds firmness, elasticity, body, and coat texture)",
      price_mxn_cents: 12000,
    },
    {
      sku: "collagen_xl",
      name_es: "Colágeno raza extra grande (firmeza, elasticidad y textura del pelaje)",
      name_en: "Collagen extra-large breed (adds firmness, elasticity, body, and coat texture)",
      price_mxn_cents: 15000,
    },
    { sku: "mobile_visit", name_es: "Visita a domicilio (zona local)", name_en: "Mobile visit (local zone)", price_mxn_cents: 20000 },
    { sku: "matting_surcharge", name_es: "Recargo nudos / pelaje muy enredado", name_en: "Matting / heavy tangle surcharge", price_mxn_cents: 30000 },
    { sku: "puppy_intro", name_es: "Primera estética cachorro", name_en: "Puppy intro groom", price_mxn_cents: 40000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_DOG_GROOMING_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_DOG_GROOMING_DISCLAIMER_EN,
  };
}

/** Pre-filled starter menu for taxi / ride-hailing fixed-price trips. */
export function taxiRideShareStarterMenu(): ServiceMenu {
  const items: ServiceMenuItem[] = [
    {
      sku: "wait_time_hour",
      name_es: "Tiempo de espera (por hora)",
      name_en: "Wait time (per hour)",
      price_mxn_cents: 30000,
    },
    {
      sku: "centro_atotonilco",
      name_es: "Centro a Atotonilco (por viaje)",
      name_en: "City Center to Atotonilco (per trip)",
      price_mxn_cents: 25000,
    },
    {
      sku: "return_sma",
      name_es: "Regreso a SMA (por viaje)",
      name_en: "Return to SMA (per trip)",
      price_mxn_cents: 25000,
    },
    {
      sku: "go_return_wait_3hr",
      name_es: "Ida y vuelta + 3 h de espera",
      name_en: "Go and return + 3 hr wait",
      price_mxn_cents: 90000,
    },
    {
      sku: "round_trip_wait_total",
      name_es: "Total — ida y vuelta + 3 h espera",
      name_en: "Total — round trip plus 3 hr wait",
      price_mxn_cents: 140000,
    },
    {
      sku: "airport_guanajuato",
      name_es: "Aeropuerto Guanajuato (ciudad)",
      name_en: "Guanajuato (city) airport",
      price_mxn_cents: 200000,
    },
    {
      sku: "airport_leon",
      name_es: "Aeropuerto León (Guanajuato)",
      name_en: "León (Guanajuato) airport",
      price_mxn_cents: 250000,
    },
    {
      sku: "airport_queretaro",
      name_es: "Aeropuerto Querétaro",
      name_en: "Querétaro (Guanajuato) airport",
      price_mxn_cents: 180000,
    },
    {
      sku: "airport_cdmx",
      name_es: "Ciudad de México",
      name_en: "Mexico City",
      price_mxn_cents: 600000,
    },
    {
      sku: "events_appointments",
      name_es: "Eventos / citas",
      name_en: "Events / appointments",
      price_mxn_cents: 30000,
    },
    {
      sku: "weddings",
      name_es: "Bodas",
      name_en: "Weddings",
      price_mxn_cents: 30000,
    },
    {
      sku: "quinceanera",
      name_es: "Quinceañera",
      name_en: "Quinceañera",
      price_mxn_cents: 30000,
    },
    {
      sku: "single_trip",
      name_es: "Viaje sencillo",
      name_en: "Single trip",
      price_mxn_cents: 10000,
    },
    {
      sku: "medical_oneway",
      name_es: "Cita médica — solo ida",
      name_en: "Medical appointment — one way",
      price_mxn_cents: 10000,
    },
    {
      sku: "quick_individual",
      name_es: "Viajes individuales rápidos",
      name_en: "Quick individual trips",
      price_mxn_cents: 8000,
    },
    {
      sku: "shopping_oneway",
      name_es: "Compras — solo ida",
      name_en: "Shopping trips — one way",
      price_mxn_cents: 10000,
    },
    {
      sku: "other_trip",
      name_es: "Otro",
      name_en: "Other",
      price_mxn_cents: 10000,
    },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_TAXI_RIDE_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_TAXI_RIDE_DISCLAIMER_EN,
  };
}

/** Sample menu for pet-care landing page (mix of common items). */
export function petCareLandingSampleMenu(): ServiceMenu {
  const walk = dogWalkingStarterMenu().items.slice(0, 4);
  const sit = petSittingStarterMenu().items.slice(0, 4);
  const groom = dogGroomingStarterMenu().items.slice(0, 4);
  return {
    version: 1,
    currency: "MXN",
    items: [...walk, ...sit, ...groom],
    disclaimer_es: DEFAULT_PET_SITTING_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_PET_SITTING_DISCLAIMER_EN,
  };
}

/** Starter template for menu-enabled provider slugs (tailoring, veterinary, …). */
export function starterMenuForProviderSlug(
  slug: string | null | undefined,
): ServiceMenu | null {
  switch (String(slug ?? "").trim()) {
    case "arreglos_de_ropa":
      return tailoringStarterMenu();
    case "veterinaria":
      return veterinaryStarterMenu();
    case "limpieza":
      return housekeepingStarterMenu();
    case "paseador":
      return dogWalkingStarterMenu();
    case "pet_sitting":
      return petSittingStarterMenu();
    case "estetica_canina":
      return dogGroomingStarterMenu();
    case "transporte_app":
      return taxiRideShareStarterMenu();
    default:
      return null;
  }
}

/** Default disclaimers when persisting a menu for a provider slug. */
export function menuDisclaimersForProviderSlug(slug: string | null | undefined): {
  disclaimer_es: string;
  disclaimer_en: string;
} {
  const menu = starterMenuForProviderSlug(slug);
  if (menu) {
    return {
      disclaimer_es: menu.disclaimer_es ?? DEFAULT_INSPECTION_DISCLAIMER_ES,
      disclaimer_en: menu.disclaimer_en ?? DEFAULT_INSPECTION_DISCLAIMER_EN,
    };
  }
  return {
    disclaimer_es: DEFAULT_INSPECTION_DISCLAIMER_ES,
    disclaimer_en: DEFAULT_INSPECTION_DISCLAIMER_EN,
  };
}
