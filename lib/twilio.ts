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
 * Send using E.164 digits only (no +). For MX mobile (+52), posts **both** +52 and +521 in parallel
 * (same as `send-otp`): WhatsApp may register the user under either; one request often returns 63015
 * while the other delivers. Sequential-first could get HTTP success on the “wrong” routing and skip
 * the format the buyer actually receives.
 */
export async function sendWhatsAppToE164Digits(toDigitsRaw: string, message: string): Promise<boolean> {
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(String(toDigitsRaw ?? "")));
  if (!digits) {
    console.error("[twilio] empty E.164 digits for WhatsApp");
    return false;
  }

  const tryMxParallel = async (): Promise<boolean> => {
    const dests = /^52\d{10}$/.test(digits) ? [digits, `521${digits.slice(2)}`] : [digits];
    const results = await Promise.all(dests.map((d) => sendWhatsApp(d, message)));
    return results.some(Boolean);
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
    const text = await res.text();
    if (!res.ok) {
      console.error("[twilio] send failed", { to, status: res.status, body: text });
      return false;
    }
    try {
      const j = JSON.parse(text) as { sid?: string; status?: string };
      if (j.sid) {
        console.log("[twilio] whatsapp accepted", { sid: j.sid, status: j.status ?? "", toTail: String(to).replace(/\D/g, "").slice(-4) });
      }
    } catch {
      /* non-json body */
    }
    return true;
  } catch (e) {
    console.error("[twilio] send error", e);
    return false;
  }
}
