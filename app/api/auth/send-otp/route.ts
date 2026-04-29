import { NextRequest, NextResponse } from "next/server";
import { canonicalizeAuthPhone, isValidAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { clientIpFromHeaders } from "@/lib/rate-limit-memory";
import { rateLimitSendOtpByIp } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/auth-server";

function generateOTP() {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
}

function asWhatsappAddress(value: string) {
  const v = value.trim();
  if (!v) return v;
  if (v.startsWith("whatsapp:")) return v;
  const cleaned = v.replace(/^whatsapp:/, "");
  return `whatsapp:${cleaned.startsWith("+") ? cleaned : `+${cleaned}`}`;
}

function logSupabaseError(step: string, phone: string, err: any) {
  const payload = {
    phone,
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    status: err?.status,
    raw: typeof err === "object" ? JSON.stringify(err) : String(err),
  };
  console.error(`[send-otp] ${step}`, payload);
}

function newRequestId(req: NextRequest) {
  return req.headers.get("x-vercel-id") ?? globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId(req);
  let step: "validate" | "rate_limit" | "insert" | "twilio" | "done" = "validate";
  try {
    const supabase = createAdminSupabase();
    const body = await req.json();
    let phone = normalizeAuthPhone(String(body?.phone ?? ""));
    phone = canonicalizeAuthPhone(phone);
    if (!phone || !isValidAuthPhone(phone)) {
      return NextResponse.json(
        {
          error: "Número inválido (México: 10 dígitos; EE.UU.: 10 dígitos con código +1)",
          requestId,
        },
        { status: 400 }
      );
    }

    const ip = clientIpFromHeaders(req.headers);
    const ipRl = await rateLimitSendOtpByIp(ip);
    if (!ipRl.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos desde esta red. Espera 15 minutos.", requestId },
        { status: 429 }
      );
    }

    step = "rate_limit";
    const rateLimitWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const maxOtpsPerWindow = 10;
    const { data: recentOtps, error: rateLimitError } = await supabase
      .from("otp_codes")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", rateLimitWindow)
      .order("created_at", { ascending: false })
      .limit(maxOtpsPerWindow);
    if (rateLimitError) {
      logSupabaseError("rate-limit-query-failed", phone, rateLimitError);
      return NextResponse.json(
        {
          error: "No se pudo enviar el código OTP",
          requestId,
          step: "rate_limit",
        },
        { status: 500 }
      );
    }
    if ((recentOtps?.length ?? 0) >= maxOtpsPerWindow) {
      return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos.", requestId }, { status: 429 });
    }

    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_WHATSAPP_FROM: from } = process.env;
    const twilioConfigured = Boolean(sid && token && from);
    if (process.env.NODE_ENV === "production" && !twilioConfigured) {
      console.error("[send-otp] production requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM", {
        requestId,
      });
      return NextResponse.json(
        {
          error:
            "Verificación por WhatsApp no está configurada en el servidor. Revisa TWILIO_* en el despliegue.",
          requestId,
          step: "twilio_config",
        },
        { status: 503 }
      );
    }

    step = "insert";
    const code = generateOTP();
    const { error: insertError } = await supabase.from("otp_codes").insert({
      phone,
      code,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      logSupabaseError("otp-insert-failed", phone, insertError);
      return NextResponse.json(
        {
          error: "No se pudo enviar el código OTP",
          requestId,
          step: "insert",
        },
        { status: 500 }
      );
    }

    if (twilioConfigured) {
      step = "twilio";
      const fromAddress = asWhatsappAddress(from!);
      const msgBody = `Tu código de Naranjogo es: *${code}*\nVálido 5 minutos. No lo compartas.`;
      const authHeader = "Basic " + Buffer.from(`${sid!}:${token!}`).toString("base64");
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid!}/Messages.json`;

      // MX numbers: send to both +52 and +521 formats simultaneously.
      // WhatsApp may register the user under either format; one will
      // deliver and the other will silently fail with error 63015.
      const destinations = [phone];
      if (/^52\d{10}$/.test(phone)) {
        destinations.push(`521${phone.slice(2)}`);
      }

      const results = await Promise.all(
        destinations.map(async (dest) => {
          const toAddress = asWhatsappAddress(dest);
          console.log("[send-otp] twilio-attempt", { requestId, phone: dest, toAddress, fromAddress });
          const res = await fetch(twilioUrl, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ From: fromAddress, To: toAddress, Body: msgBody }),
          });
          const body = await res.text();
          console.log("[send-otp] twilio-response", { requestId, phone: dest, status: res.status, body });
          return { dest, ok: res.ok, status: res.status, body };
        })
      );

      const anyOk = results.some((r) => r.ok);
      if (!anyOk) {
        let twilioError = "";
        let twilioCode: number | undefined;
        try {
          const parsed = JSON.parse(results[0].body);
          twilioError = parsed?.message || parsed?.error_message || "";
          twilioCode = typeof parsed?.code === "number" ? parsed.code : undefined;
        } catch {
          /* not json */
        }
        const sandboxHint =
          twilioCode === 63016 || /63016|not a valid WhatsApp user|join.*sandbox/i.test(twilioError)
            ? " Si usas el sandbox de Twilio, envía primero el mensaje de unión al número de prueba."
            : "";
        return NextResponse.json(
          {
            error: `No se pudo enviar el código OTP${twilioError ? `: ${twilioError}` : ""}${sandboxHint}`,
            requestId,
            step: "twilio",
            twilioStatus: results[0].status,
            twilioCode,
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`[DEV OTP] +${phone} -> ${code}`);
    }

    step = "done";
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, devOtp: code, requestId });
    }
    return NextResponse.json({ ok: true, requestId });
  } catch (e: any) {
    console.error("[send-otp] unhandled error", { requestId, step, message: e?.message, stack: e?.stack });
    const msg = process.env.NODE_ENV === "production" ? "No se pudo enviar el código OTP" : e?.message;
    return NextResponse.json({ error: msg, requestId, step }, { status: 500 });
  }
}
