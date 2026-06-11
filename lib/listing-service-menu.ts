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

export function hasServiceMenu(menu: ServiceMenu | null | undefined): boolean {
  return Boolean(menu && Array.isArray(menu.items) && menu.items.length > 0);
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
    { sku: "consult_general", name_es: "Consulta general (perro/gato)", name_en: "General exam (dog/cat)", price_mxn_cents: 35000 },
    { sku: "consult_puppy", name_es: "Consulta cachorro / kitten", name_en: "Puppy/k kitten exam", price_mxn_cents: 40000 },
    { sku: "consult_followup", name_es: "Consulta de seguimiento", name_en: "Follow-up visit", price_mxn_cents: 25000 },
    { sku: "vaccine_rabies_dog", name_es: "Vacuna antirrábica (perro)", name_en: "Rabies vaccine (dog)", price_mxn_cents: 28000 },
    { sku: "vaccine_rabies_cat", name_es: "Vacuna antirrábica (gato)", name_en: "Rabies vaccine (cat)", price_mxn_cents: 28000 },
    { sku: "vaccine_quintuple", name_es: "Vacuna múltiple perro (quintuple)", name_en: "Dog multivalent vaccine", price_mxn_cents: 45000 },
    { sku: "vaccine_triple_felina", name_es: "Vacuna triple felina", name_en: "Feline triple vaccine", price_mxn_cents: 42000 },
    { sku: "deworm_oral", name_es: "Desparasitación oral", name_en: "Oral deworming", price_mxn_cents: 18000 },
    { sku: "deworm_inject", name_es: "Desparasitación inyectable", name_en: "Injectable deworming", price_mxn_cents: 22000 },
    { sku: "nail_trim", name_es: "Corte de uñas", name_en: "Nail trim", price_mxn_cents: 12000 },
    { sku: "ear_clean", name_es: "Limpieza de oídos", name_en: "Ear cleaning", price_mxn_cents: 15000 },
    { sku: "chip_id", name_es: "Microchip + registro", name_en: "Microchip + registration", price_mxn_cents: 65000 },
    { sku: "blood_panel_basic", name_es: "Química sanguínea básica", name_en: "Basic blood panel", price_mxn_cents: 90000 },
    { sku: "urinalysis", name_es: "Examen general de orina", name_en: "Urinalysis", price_mxn_cents: 35000 },
    { sku: "fluid_subq", name_es: "Fluidos subcutáneos", name_en: "Subcutaneous fluids", price_mxn_cents: 40000 },
    { sku: "home_visit_fee", name_es: "Visita a domicilio (dentro de zona)", name_en: "Home visit (in zone)", price_mxn_cents: 30000 },
    { sku: "emergency_surcharge", name_es: "Urgencia fuera de horario", name_en: "After-hours emergency surcharge", price_mxn_cents: 50000 },
    { sku: "cert_travel", name_es: "Certificado de salud para viaje", name_en: "Travel health certificate", price_mxn_cents: 55000 },
    { sku: "euthanasia_consult", name_es: "Consulta valoración eutanasia", name_en: "Euthanasia consultation", price_mxn_cents: 60000 },
  ];
  return {
    version: 1,
    currency: "MXN",
    items,
    disclaimer_es: DEFAULT_VET_DISCLAIMER_SPANISH,
    disclaimer_en: DEFAULT_VET_DISCLAIMER_EN,
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
