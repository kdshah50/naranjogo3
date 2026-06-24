/**
 * Categories shown in the top bar. Only `browseEnabled: true` are clickable for MVP rollout.
 * Turn on more categories by setting `browseEnabled` — keep in sync with `PRICE_FLOORS` in listings API.
 */
export type MarketplaceCategory = {
  id: string;
  icon: string;
  label: { es: string; en: string };
  browseEnabled: boolean;
};

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  { id: "services", icon: "🔧", label: { es: "Servicios", en: "Services" }, browseEnabled: true },
  { id: "electronics", icon: "📱", label: { es: "Electrónica", en: "Electronics" }, browseEnabled: false },
  { id: "vehicles", icon: "🚗", label: { es: "Vehículos", en: "Vehicles" }, browseEnabled: false },
  { id: "fashion", icon: "👗", label: { es: "Moda", en: "Fashion" }, browseEnabled: false },
  { id: "home", icon: "🏠", label: { es: "Hogar", en: "Home" }, browseEnabled: false },
  { id: "realestate", icon: "🏡", label: { es: "Bienes Raíces", en: "Real Estate" }, browseEnabled: false },
  { id: "sports", icon: "⚽", label: { es: "Deportes", en: "Sports" }, browseEnabled: false },
];

const ENABLED_IDS = new Set(
  MARKETPLACE_CATEGORIES.filter((c) => c.browseEnabled).map((c) => c.id)
);

/** Safe slug for PostgREST `category_id=eq.<slug>`. */
export function normalizeBrowseCategory(raw: string | undefined | null): string {
  const s = (raw ?? "services").trim().toLowerCase();
  if (ENABLED_IDS.has(s)) return s;
  return "services";
}

export function categoryLabel(categoryId: string, lang: "es" | "en"): string {
  const c = MARKETPLACE_CATEGORIES.find((x) => x.id === categoryId);
  return c?.label[lang] ?? (lang === "en" ? "Listings" : "Anuncios");
}
