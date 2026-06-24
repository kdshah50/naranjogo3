import type { Lang } from "@/lib/i18n-lang";

type ListingTextFields = {
  title_es?: string | null;
  title_en?: string | null;
  description_es?: string | null;
  description_en?: string | null;
};

export function listingDisplayTitle(listing: ListingTextFields, lang: Lang): string {
  if (lang === "en") {
    const en = String(listing.title_en ?? "").trim();
    if (en) return en;
  }
  const es = String(listing.title_es ?? "").trim();
  return es || String(listing.title_en ?? "").trim() || "";
}

export function listingDisplayDescription(listing: ListingTextFields, lang: Lang): string {
  if (lang === "en") {
    const en = String(listing.description_en ?? "").trim();
    if (en) return en;
  }
  const es = String(listing.description_es ?? "").trim();
  return es || String(listing.description_en ?? "").trim() || "";
}
