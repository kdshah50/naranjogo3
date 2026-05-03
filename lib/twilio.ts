const TWILIO_SID = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? "";

function asWhatsappAddress(value: string) {
  const v = value.trim();
  if (!v) return v;
  if (v.startsWith("whatsapp:")) return v;
  const cleaned = v.replace(/^whatsapp:/, "");
  return `whatsapp:${cleaned.startsWith("+") ? cleaned : `+${cleaned}`}`;
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
