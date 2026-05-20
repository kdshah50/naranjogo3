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
  if (/^NG-[\da-f]{8}$/.test(t)) return t;
  if (/^NG[\da-f]{8}$/.test(t)) return `NG-${t.slice(2)}`;
  /** WhatsApp / copy-paste often misreads NG- as NJ- (Naranjo). */
  if (/^NJ-[\da-f]{8}$/.test(t)) return `NG-${t.slice(3)}`;
  if (/^NJ[\da-f]{8}$/.test(t)) return `NG-${t.slice(2)}`;
  if (/^[\da-f]{8}$/.test(t)) return `NG-${t}`;
  return null;
}
