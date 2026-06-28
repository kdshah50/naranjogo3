import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Ciphertext prefix — values starting with this are decrypted on read. */
export const PII_CIPHERTEXT_PREFIX = "enc:v1:";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function loadKey(): Buffer | null {
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.length === KEY_LEN ? key : null;
  } catch {
    return null;
  }
}

export function isPiiEncryptionConfigured(): boolean {
  return loadKey() != null;
}

export function isEncryptedPiiValue(value: string): boolean {
  return String(value ?? "").startsWith(PII_CIPHERTEXT_PREFIX);
}

/** AES-256-GCM encrypt; returns plaintext unchanged when key unset (local dev only). */
export function encryptPii(plaintext: string): string {
  const text = String(plaintext ?? "");
  if (!text || isEncryptedPiiValue(text)) return text;

  const key = loadKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error("[pii-crypto] PII_ENCRYPTION_KEY missing in production — storing plaintext");
    }
    return text;
  }

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `${PII_CIPHERTEXT_PREFIX}${packed}`;
}

/** Decrypt enc:v1 values; passthrough for legacy plaintext. */
export function decryptPii(stored: string): string {
  const text = String(stored ?? "");
  if (!isEncryptedPiiValue(text)) return text;

  const key = loadKey();
  if (!key) return text;

  try {
    const packed = Buffer.from(text.slice(PII_CIPHERTEXT_PREFIX.length), "base64url");
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch (e) {
    console.error("[pii-crypto] decrypt failed", e);
    return text;
  }
}

const MASKED_VALUE_HINT =
  /\*{4,}|\[protegido\]|\[protected\]|complete number and address|número y dirección completos/i;

function skipChatValueEncryption(value: string): boolean {
  return MASKED_VALUE_HINT.test(value);
}

const CHAT_PII_LINE_RULES: Array<{
  regex: RegExp;
  skipMasked?: boolean;
}> = [
  { regex: /((?:Nombre|Name)\s*:\s*)([^\n]+)/gi },
  { regex: /((?:Tel[eé]fono(?: de contacto)?|Phone(?: number)?|WhatsApp)\s*:\s*)([^\n]+)/gi, skipMasked: true },
  {
    regex: /((?:Direcci[oó]n(?: del servicio)?|Service address|Visit \/ clinic address|Pickup \/ service address|Pickup address|From \/ pickup|Origen \/ recogida)\s*:\s*)([^\n]+)/gi,
    skipMasked: true,
  },
  {
    regex: /((?:Destino|Destination|To \/ drop-off)\s*:\s*)([^\n]+)/gi,
    skipMasked: true,
  },
  {
    regex: /((?:D[ií]a y hora preferidos|Preferred (?:visit |pickup )?day & time|Preferred appointment day & time|Preferred day & time)\s*:\s*)([^\n]+)/gi,
  },
  {
    regex: /((?:Notas|Notes)\s*:\s*)([^\n]+)/gi,
  },
];

/** Encrypt identifiable substrings in chat message bodies before DB insert. */
export function encryptPiiInChatBody(body: string): string {
  let out = String(body ?? "");
  for (const rule of CHAT_PII_LINE_RULES) {
    out = out.replace(rule.regex, (match, prefix: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isEncryptedPiiValue(trimmed)) return match;
      if (rule.skipMasked && skipChatValueEncryption(trimmed)) return match;
      return `${prefix}${encryptPii(trimmed)}`;
    });
  }
  return out;
}

/** Restore chat message bodies after read (before display masking). */
export function decryptPiiInChatBody(body: string): string {
  let out = String(body ?? "");
  for (const rule of CHAT_PII_LINE_RULES) {
    out = out.replace(rule.regex, (match, prefix: string, value: string) => {
      const trimmed = value.trim();
      if (!isEncryptedPiiValue(trimmed)) return match;
      return `${prefix}${decryptPii(trimmed)}`;
    });
  }
  return out;
}
