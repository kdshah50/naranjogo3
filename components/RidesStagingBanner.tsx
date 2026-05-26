"use client";

import { useAppLang } from "@/hooks/use-app-lang";

const STABLE_ORIGIN = process.env.NEXT_PUBLIC_STABLE_ORIGIN?.replace(/\/$/, "") ?? "";
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";

/**
 * Preview/local hint: bookmark the stable branch URL so OTP cookies survive redeploys.
 */
export function RidesStagingBanner() {
  if (VERCEL_ENV !== "preview" && VERCEL_ENV !== "development") return null;
  if (!STABLE_ORIGIN && VERCEL_ENV !== "development") return null;

  const lang = useAppLang();
  const es = lang === "es";

  const title = es ? "Prueba de viajes (staging)" : "Rides staging";
  const body = es
    ? STABLE_ORIGIN
      ? `Usa siempre esta URL (no cambia en cada deploy): ${STABLE_ORIGIN} — una sola sesión OTP sirve para pasajero y conductor en dos pestañas.`
      : "Local: RIDES_ENABLED=true npm run dev — una sesión OTP, /viaje y /conductor/viajes en dos pestañas."
    : STABLE_ORIGIN
      ? `Bookmark this URL (stable across deploys): ${STABLE_ORIGIN} — one OTP session works for rider + driver in two tabs.`
      : "Local: RIDES_ENABLED=true npm run dev — one OTP, /viaje and /conductor/viajes in two tabs.";

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
