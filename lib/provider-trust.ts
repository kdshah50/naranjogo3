import type { Lang } from "@/lib/i18n-lang";

export type BeforeAfterPair = { before: string; after: string };

/** Parse listings.before_after_photo_urls (jsonb array). */
export function parseBeforeAfterPhotoUrls(raw: unknown): BeforeAfterPair[] {
  if (!Array.isArray(raw)) return [];
  const out: BeforeAfterPair[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const b = String((row as { before?: string }).before ?? "").trim();
    const a = String((row as { after?: string }).after ?? "").trim();
    if (b.startsWith("http") && a.startsWith("http")) out.push({ before: b, after: a });
  }
  return out.slice(0, 12);
}

/** Strong identity / tier — show “verified provider” hero line. */
export function isVerifiedProviderProfile(input: {
  ineVerified: boolean;
  rfcVerified: boolean;
  trustBadge: string;
}): boolean {
  if (input.ineVerified || input.rfcVerified) return true;
  const t = (input.trustBadge ?? "none").toLowerCase();
  return t === "gold" || t === "diamond";
}

export function trustMicrocopy(lang: Lang): string {
  return lang === "en"
    ? "Can you trust them without meeting first? Check verification, completed jobs on Naranjogo, and before/after photos."
    : "¿Puedes confiar sin conocerlo? Revisa verificación, trabajos completados por la app y fotos antes/después.";
}
