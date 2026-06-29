/**
 * Normalize NG- ticket codes from URLs, WhatsApp, or copy-paste.
 * Strips whitespace, normalizes unicode dashes, accepts NG-XXXXXXXX / NGXXXXXXXX / XXXXXXXX.
 */
export function normalizeNgTicketQuery(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let t = String(raw)
    .trim()
    .replace(/[\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!t) return null;
  const hex8 = "[\\da-fA-F]{8}";
  if (new RegExp(`^NG-${hex8}$`).test(t)) return t;
  if (new RegExp(`^NG${hex8}$`).test(t)) return `NG-${t.slice(2)}`;
  /** WhatsApp / copy-paste often misreads NG- as NJ- (Naranjo). */
  if (new RegExp(`^NJ-${hex8}$`).test(t)) return `NG-${t.slice(3)}`;
  if (new RegExp(`^NJ${hex8}$`).test(t)) return `NG-${t.slice(2)}`;
  if (new RegExp(`^${hex8}$`).test(t)) return `NG-${t}`;
  /** Letter o/O in the hex suffix (WhatsApp / phone fonts misread 0). */
  const suffix = t.replace(/^NG-/i, "").replace(/^NG/i, "");
  const ocrBody = suffix.replace(/[oO]/g, "0");
  if (new RegExp(`^${hex8}$`).test(ocrBody)) return `NG-${ocrBody}`;
  return null;
}
