/**
 * Mask / redact personally identifiable information for chat bubbles and outbound copy.
 * Full values remain in authenticated quote metadata (seller request panel only).
 */

/** Mask phone for display — keeps country hint + last 4 digits. */
export function maskPhoneForDisplay(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const last4 = digits.slice(-4);
  if (digits.startsWith("52") && digits.length >= 12) return `+52 ******${last4}`;
  if (digits.startsWith("1") && digits.length >= 11) return `+1 ******${last4}`;
  return `******${last4}`;
}

/** Mask street-level address while keeping general area when possible. */
export function maskAddressForDisplay(raw: string, lang: "es" | "en" = "es"): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const protectedLabel = lang === "en" ? "[protected]" : "[protegido]";

  if (/^(Origen|Destino|Origin|Destination)\s*:/i.test(t)) {
    return t
      .split("\n")
      .map((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return protectedLabel;
        return `${line.slice(0, idx + 1)} ${protectedLabel}`;
      })
      .join("\n");
  }

  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const area = parts[parts.length - 1];
    return `${protectedLabel} … ${area}`;
  }
  return t.length > 6 ? `${t.slice(0, 2)}***` : protectedLabel;
}

const PHONE_LINE =
  /((?:Tel[eé]fono(?: de contacto)?|Phone(?: number)?|WhatsApp)\s*:\s*)([^\n]+)/gi;
const ADDRESS_LINE =
  /((?:Direcci[oó]n(?: del servicio)?|Service address)\s*:\s*)([^\n]+)/gi;

/** Redact PII lines in stored chat text (legacy messages + defense in depth). */
export function redactPiiInChatDisplay(body: string, lang: "es" | "en" = "es"): string {
  let out = String(body ?? "");
  out = out.replace(PHONE_LINE, (_m, prefix: string, phone: string) => {
    return `${prefix}${maskPhoneForDisplay(phone.trim())}`;
  });
  out = out.replace(ADDRESS_LINE, (_m, prefix: string, addr: string) => {
    return `${prefix}${maskAddressForDisplay(addr.trim(), lang)}`;
  });
  return out;
}
