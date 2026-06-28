import "server-only";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";

export const QUOTE_PII_STRING_FIELDS = [
  "buyerFirstName",
  "buyerLastName",
  "contactPhone",
  "whatsappPhone",
  "serviceAddress",
  "preferredAt",
  "buyerNotes",
] as const;

type QuotePiiRecord = Record<string, unknown>;

/** Decrypt PII string fields inside quote_metadata JSON from the database. */
export function decryptQuoteMetadataPii<T extends QuotePiiRecord | null>(meta: T): T {
  if (!meta) return meta;
  const out: QuotePiiRecord = { ...meta };
  for (const field of QUOTE_PII_STRING_FIELDS) {
    const v = out[field];
    if (typeof v === "string") out[field] = decryptPii(v);
  }
  return out as T;
}

/** Encrypt PII string fields before persisting quote_metadata. */
export function encryptQuoteMetadataForStorage(meta: QuotePiiRecord | null | undefined): QuotePiiRecord | null {
  if (!meta) return null;
  const out: QuotePiiRecord = { ...meta };
  for (const field of QUOTE_PII_STRING_FIELDS) {
    const v = out[field];
    if (typeof v === "string" && v.trim()) out[field] = encryptPii(v);
  }
  return out;
}
