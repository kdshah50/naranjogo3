import { PROVIDER_SERVICES, providerServiceSupportsMenu } from "@/lib/provider-services";

/** Infer provider signup slug from listing title (provider-signup uses `{label} — {colonia}, SMA`). */
export function inferProviderSlugFromListingTitle(title: string | null | undefined): string | null {
  const t = String(title ?? "").trim();
  if (!t) return null;
  for (const s of PROVIDER_SERVICES) {
    const esPrefix = `${s.es} —`;
    const enPrefix = `${s.en} —`;
    if (t.startsWith(esPrefix) || t.startsWith(enPrefix)) {
      return s.value;
    }
  }
  return null;
}

export function listingTitleSupportsServiceMenu(title: string | null | undefined): boolean {
  const slug = inferProviderSlugFromListingTitle(title);
  return slug != null && providerServiceSupportsMenu(slug);
}
