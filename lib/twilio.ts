import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";

const TWILIO_SID = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? "";

/** True when WhatsApp outbound is configured (before validating recipient). */
export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(TWILIO_SID() && TWILIO_TOKEN() && TWILIO_FROM());
}

function asWhatsappAddress(value: string) {
  const v = value.trim();
  if (!v) return v;
  if (v.startsWith("whatsapp:")) return v;
  const cleaned = v.replace(/^whatsapp:/, "");
  return `whatsapp:${cleaned.startsWith("+") ? cleaned : `+${cleaned}`}`;
}

/** Gap between MX +52 / +521 attempts — avoids hammering Twilio when the first variant is wrong. */
const MX_VARIANT_GAP_MS = 450;
/** Second pass after bursts (e.g. scheduled + in progress + completed in a few minutes). */
const WHATSAPP_RETRY_AFTER_MS = 2200;

/**
 * Send using E.164 digits only (no +). For MX mobile (+52), also tries legacy +521 WhatsApp routing
 * (same pattern as OTP). Variants are tried **sequentially** so we only deliver once and reduce
 * duplicate parallel posts (helps with Twilio 429 / throttling after several lifecycle messages).
 */
export async function sendWhatsAppToE164Digits(toDigitsRaw: string, message: string): Promise<boolean> {
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(String(toDigitsRaw ?? "")));
  if (!digits) {
    console.error("[twilio] empty E.164 digits for WhatsApp");
    return false;
  }
  const variants = [digits];
  if (/^52\d{10}$/.test(digits)) {
    variants.push(`521${digits.slice(2)}`);
  }

  const tryVariants = async (): Promise<boolean> => {
    for (let i = 0; i < variants.length; i++) {
      const d = variants[i]!;
      if (await sendWhatsApp(d, message)) return true;
      if (i < variants.length - 1) {
        await new Promise((r) => setTimeout(r, MX_VARIANT_GAP_MS));
      }
    }
    return false;
  };

  if (await tryVariants()) return true;
  await new Promise((r) => setTimeout(r, WHATSAPP_RETRY_AFTER_MS));
  return tryVariants();
}

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  const sid = TWILIO_SID();
  const token = TWILIO_TOKEN();
  const from = TWILIO_FROM();
  if (!sid || !token || !from || !to) {
    console.error("[twilio] missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, or empty recipient");
    return false;
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: asWhatsappAddress(from),
        To: asWhatsappAddress(to),
        Body: message,
      }),
    });
    if (!res.ok) {
      console.error("[twilio] send failed", { to, status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (e) {
    console.error("[twilio] send error", e);
    return false;
  }
}
