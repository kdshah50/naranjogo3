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

/** Second pass after bursts (e.g. scheduled + in progress + completed in a few minutes). */
const WHATSAPP_RETRY_AFTER_MS = 2200;

/**
 * Send using E.164 digits only (no +). For MX mobile (+52), sends to +521 only — the +52 route
 * often accepts then fails with 63015; dual-send could mark notify “delivered” without delivery.
 */
export async function sendWhatsAppToE164Digits(toDigitsRaw: string, message: string): Promise<boolean> {
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(String(toDigitsRaw ?? "")));
  if (!digits) {
    console.error("[twilio] empty E.164 digits for WhatsApp");
    return false;
  }

  const tryMxParallel = async (): Promise<boolean> => {
    // MX mobile WhatsApp registers on +521…; +52… often returns 63015 and never delivers.
    if (/^52\d{10}$/.test(digits)) {
      return sendWhatsApp(`521${digits.slice(2)}`, message);
    }
    if (/^521\d{10}$/.test(digits)) {
      return sendWhatsApp(digits, message);
    }
    return sendWhatsApp(digits, message);
  };

  if (await tryMxParallel()) return true;
  await new Promise((r) => setTimeout(r, WHATSAPP_RETRY_AFTER_MS));
  return tryMxParallel();
}

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  const sid = TWILIO_SID();
  const token = TWILIO_TOKEN();
  const from = TWILIO_FROM();
  if (!sid || !token || !from || !to) {
    console.error("[twilio] missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, or empty recipient");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({
    From: asWhatsappAddress(from),
    To: asWhatsappAddress(to),
    Body: message,
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const text = await res.text();
      if (res.ok) {
        try {
          const j = JSON.parse(text) as { sid?: string; status?: string };
          if (j.sid) {
            console.log("[twilio] whatsapp accepted", {
              sid: j.sid,
              status: j.status ?? "",
              toTail: String(to).replace(/\D/g, "").slice(-4),
            });
          }
        } catch {
          /* non-json body */
        }
        return true;
      }
      if (res.status === 429 && attempt < 3) {
        const backoff = 1200 * (attempt + 1);
        console.warn("[twilio] 429 rate limit, retry after ms", backoff, { toTail: String(to).replace(/\D/g, "").slice(-4) });
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      console.error("[twilio] send failed", { to, status: res.status, body: text });
      return false;
    } catch (e) {
      console.error("[twilio] send error", e);
      return false;
    }
  }
  return false;
}
