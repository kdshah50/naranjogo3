import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { canonicalizeAuthPhone, isValidAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { getJwtSecretBytes } from "@/lib/jwt-secret";
import { TIANGUIS_TOKEN_COOKIE, createAdminSupabase } from "@/lib/auth-server";
import {
  canonicalizeDuplicateUserPhones,
  pickLoginUserForPhone,
} from "@/lib/resolve-login-user";

const IS_PROD = process.env.NODE_ENV === "production";

function clientError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function serverError(log: unknown) {
  console.error("[verify-otp]", log);
  return NextResponse.json(
    { error: IS_PROD ? "Error al verificar. Intenta de nuevo." : String((log as Error)?.message ?? log) },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminSupabase();
    const body = await req.json();
    let phone = normalizeAuthPhone(String(body?.phone ?? ""));
    phone = canonicalizeAuthPhone(phone);
    const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);
    const referralCodeRaw = String(body?.referralCode ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "")
      .slice(0, 12);

    if (!isValidAuthPhone(phone) || code.length !== 6) {
      return clientError(400, "Datos de verificación inválidos");
    }

    let secret: Uint8Array;
    try {
      secret = getJwtSecretBytes();
    } catch (e) {
      console.error("[verify-otp] JWT_SECRET", e);
      return clientError(503, "Autenticación no configurada en el servidor");
    }

    const baseOtpQuery = () =>
      supabase
        .from("otp_codes")
        .select("*")
        .eq("phone", phone)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

    let { data: otp, error: otpError } = await baseOtpQuery().eq("code", code).maybeSingle();

    if (otpError) {
      const numericCode = Number(code);
      if (Number.isInteger(numericCode)) {
        const retry = await baseOtpQuery().eq("code", numericCode).maybeSingle();
        otp = retry.data;
        otpError = retry.error;
      }
    }

    if (otpError) {
      console.error("[verify-otp] lookup error", otpError);
      return clientError(500, "No se pudo validar el código OTP");
    }
    if (!otp) {
      return clientError(401, "Código incorrecto o expirado");
    }

    const { error: markUsedError } = await supabase.from("otp_codes").update({ used: true }).eq("id", otp.id);
    if (markUsedError) {
      return clientError(500, "No se pudo actualizar el OTP");
    }

    let user: { id: string; display_name: string | null; trust_badge: string } | null =
      await pickLoginUserForPhone(supabase, phone);

    if (user) {
      await canonicalizeDuplicateUserPhones(supabase, phone);
    } else {
      let referredBy: string | null = null;
      if (referralCodeRaw.length >= 4) {
        const { data: rc } = await supabase
          .from("referral_codes")
          .select("user_id")
          .eq("code", referralCodeRaw)
          .maybeSingle();
        if (rc?.user_id) referredBy = rc.user_id;
      }
      const { data: inserted, error: insErr } = await supabase
        .from("users")
        .insert({ phone, phone_verified: true, trust_badge: "bronze", referred_by: referredBy })
        .select("id, display_name, trust_badge")
        .single();
      if (insErr || !inserted) {
        return clientError(500, "No se pudo crear/actualizar usuario");
      }
      user = inserted;
    }
    if (!user) {
      return clientError(500, "No se pudo crear/actualizar usuario");
    }

    const token = await new SignJWT({ sub: user.id, phone, badge: user.trust_badge })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .setIssuedAt()
      .sign(secret);

    const res = NextResponse.json({ user });
    res.cookies.set(TIANGUIS_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    return serverError(e);
  }
}
