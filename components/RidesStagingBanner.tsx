"use client";

import { useAppLang } from "@/hooks/use-app-lang";

const STABLE_ORIGIN = process.env.NEXT_PUBLIC_STABLE_ORIGIN?.replace(/\/$/, "") ?? "";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";

/**
 * Preview/local hint: bookmark the stable branch URL so OTP cookies survive redeploys.
 */
export function RidesStagingBanner() {
  const lang = useAppLang();

  if (VERCEL_ENV !== "preview" && VERCEL_ENV !== "development") return null;
  if (!STABLE_ORIGIN && VERCEL_ENV !== "development") return null;

  const es = lang === "es";

  const title = es ? "Prueba de viajes (staging)" : "Rides staging";
  const body = es
    ? STABLE_ORIGIN
      ? `Usa siempre esta URL: ${STABLE_ORIGIN} — Pasajero (Kay): su teléfono en /viaje. Conductor (Carme): 415 181 6902 en /conductor/viajes. Son cuentas distintas; cierra sesión en /unete al cambiar de rol.`
      : "Local: RIDES_ENABLED=true npm run dev — pasajero y conductor son cuentas OTP distintas (conductor: 415 181 6902)."
    : STABLE_ORIGIN
      ? `Bookmark this URL: ${STABLE_ORIGIN} — Rider (Kay): their phone on /viaje. Driver (Carme): 415 181 6902 on /conductor/viajes. Different accounts; log out at /unete when switching.`
      : "Local: RIDES_ENABLED=true npm run dev — rider and driver use different OTP accounts (driver: 415 181 6902).";

  return (
    <div className="mb-4 rounded-lg border border-[#1B4332]/20 bg-[#E8F5E9] px-4 py-3 text-xs text-[#1B4332] leading-relaxed">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{body}</p>
      {STABLE_ORIGIN && (
        <a href={STABLE_ORIGIN} className="mt-2 inline-block font-medium underline break-all">
          {STABLE_ORIGIN}
        </a>
      )}
    </div>
  );
}
