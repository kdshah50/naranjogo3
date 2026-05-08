/**
 * E.164 digits without leading +.
 * Mexico: country code 52 + 10-digit national number → `52` + 10 digits (12 chars).
 * US/Canada: `1` + 10 digits (NANP).
 * Also accepts legacy `521` + 10 digits for backward compat (canonicalized to `52`).
 */
export function isValidAuthPhone(phone: string): boolean {
  return /^52\d{10}$/.test(phone) || /^521\d{10}$/.test(phone) || /^1\d{10}$/.test(phone);
}

/**
 * Normalize `users.phone` for Twilio WhatsApp: E.164 digits without `+`.
 * If exactly 10 digits remain after strip/canonicalize, prepends Mexico `52` (primary market).
 * US/Canada must already be stored as `1` + 10 digits per app contract.
 */
export function e164DigitsForWhatsAppRecipient(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  let d = canonicalizeAuthPhone(normalizeAuthPhone(s));
  if (/^\d{10}$/.test(d)) d = `52${d}`;
  d = canonicalizeAuthPhone(d);
  return isValidAuthPhone(d) ? d : "";
}

/** Normalize phone to digits-only E.164 without plus sign. */
export function normalizeAuthPhone(input: string): string {
  return input.replace(/[^0-9]/g, "").replace(/^00/, "");
}

/** Mexico: strip legacy mobile trunk `1` so number is `52` + 10 national digits. */
export function canonicalizeAuthPhone(phone: string): string {
  if (/^521\d{10}$/.test(phone)) {
    return `52${phone.slice(3)}`;
  }
  return phone;
}

export function formatMxLocalInput(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
}

/** US/CA 10-digit NANP: (555) 123-4567 */
export function formatUsLocalInput(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function nationalDigitsForDisplay(phone: string): { prefix: string; formatted: string } {
  if (!phone) return { prefix: "", formatted: "" };
  if (phone.startsWith("52") && phone.length === 12) {
    const n = phone.slice(2);
    return {
      prefix: "+52",
      formatted: n.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3"),
    };
  }
  if (phone.startsWith("1") && phone.length === 11) {
    const n = phone.slice(1);
    return {
      prefix: "+1",
      formatted: n.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
    };
  }
  return { prefix: `+${phone}`, formatted: phone };
}
