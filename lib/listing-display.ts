import type { Lang } from "@/lib/i18n-lang";
import { normalizeLegacyProviderListingTitlePrefix, PROVIDER_SERVICES } from "@/lib/provider-services";

type ListingTextFields = {
  title_es?: string | null;
  title_en?: string | null;
  description_es?: string | null;
  description_en?: string | null;
};

/** Swap provider service prefix in listing titles (signup often stores English in title_es). */
function localizeProviderListingTitlePrefix(title: string, lang: Lang): string {
  const t = normalizeLegacyProviderListingTitlePrefix(title, lang).trim();
  if (!t) return title;
  for (const s of PROVIDER_SERVICES) {
    const esPrefix = `${s.es} —`;
    const enPrefix = `${s.en} —`;
    if (lang === "es" && t.startsWith(enPrefix)) {
      return `${s.es} —${t.slice(enPrefix.length)}`;
    }
    if (lang === "en" && t.startsWith(esPrefix)) {
      return `${s.en} —${t.slice(esPrefix.length)}`;
    }
  }
  return title;
}

export function listingDisplayTitle(listing: ListingTextFields, lang: Lang): string {
  if (lang === "en") {
    const en = String(listing.title_en ?? "").trim();
    if (en) return localizeProviderListingTitlePrefix(en, lang);
    const es = String(listing.title_es ?? "").trim();
    return localizeProviderListingTitlePrefix(es || String(listing.title_en ?? "").trim() || "", lang);
  }
  const es = String(listing.title_es ?? "").trim();
  const primary = es || String(listing.title_en ?? "").trim() || "";
  return localizeProviderListingTitlePrefix(primary, lang);
}

export function listingDisplayDescription(listing: ListingTextFields, lang: Lang): string {
  if (lang === "en") {
    const en = String(listing.description_en ?? "").trim();
    if (en) return en;
  }
  const es = String(listing.description_es ?? "").trim();
  return es || String(listing.description_en ?? "").trim() || "";
}
