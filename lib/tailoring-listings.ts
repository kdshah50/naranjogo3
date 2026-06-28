import { PROVIDER_SERVICES, TAILORING_SERVICE } from "@/lib/provider-services";

const tailoringLabels = PROVIDER_SERVICES.find((s) => s.value === TAILORING_SERVICE);

/** Title prefixes for provider-signup tailoring listings (`{label} — {colonia}, SMA`). */
export const TAILORING_LISTING_TITLE_PREFIXES = [
  `${tailoringLabels?.es ?? "Arreglos de ropa / costurería"} —`,
  `${tailoringLabels?.en ?? "Clothing Alterations / Tailoring"} —`,
] as const;

export function isTailoringListingTitle(title: string | null | undefined): boolean {
  const t = String(title ?? "").trim();
  if (!t) return false;
  return TAILORING_LISTING_TITLE_PREFIXES.some((p) => t.startsWith(p));
}
