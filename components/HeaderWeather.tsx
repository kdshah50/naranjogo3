"use client";

import { useEffect, useState } from "react";
import { weatherEmoji } from "@/lib/weather-icons";
import type { Lang } from "@/lib/i18n-lang";

type Payload = {
  label: string;
  useFahrenheit: boolean;
  timezone: string;
  isApproximate: boolean;
  current: { temp: number; code: number; isDay: boolean };
  days: Array<{ date: string; max: number; min: number; code: number }>;
};

function weekdayShort(isoDate: string, tz: string, locale: string) {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz }).format(d);
  } catch {
    return isoDate.slice(5);
  }
}

export default function HeaderWeather({ lang }: { lang: Lang }) {
  const es = lang === "es";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = (lat: number | null, lng: number | null) => {
      const qs =
        lat != null && lng != null
          ? `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
          : "";
      fetch(`/api/weather${qs}`, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((p: Payload) => {
          if (!cancelled) setData(p);
        })
        .catch(() => {
          if (!cancelled) setHide(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude),
        () => load(null, null),
        { enableHighAccuracy: false, maximumAge: 600_000, timeout: 14_000 }
      );
    } else {
      load(null, null);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (hide) return null;

  const locale = es ? "es-MX" : "en-US";

  if (loading || !data) {
    return (
      <div className="border-t border-[#E5E0D8] bg-gradient-to-r from-[#FDF8F1] to-[#F4F0EB] px-4 py-2">
        <div className="max-w-5xl mx-auto h-9 rounded-xl bg-[#E5E0D8]/70 animate-pulse" aria-hidden />
      </div>
    );
  }

  const unit = data.useFahrenheit ? "°F" : "°C";
  const t = (n: number) => `${n}${unit}`;
  const tz = data.timezone;
  const today = data.days[0];
  const next = data.days.slice(1, 5);

  return (
    <div
      className="border-t border-[#E5E0D8] bg-gradient-to-r from-[#FDF8F1] via-white to-[#F4F0EB] px-4 py-2.5 text-[#1C1917]"
      role="region"
      aria-label={es ? "Clima en tu ubicación" : "Weather at your location"}
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-[1_1_14rem]">
          <span className="text-base flex-shrink-0" aria-hidden>
            📍
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#1B4332] truncate leading-tight" title={data.label}>
              {data.label}
            </p>
            {data.isApproximate && (
              <p
                className="text-[10px] text-[#92400E] leading-tight truncate"
                title={
                  es
                    ? "Sin permiso de ubicación: mostramos el clima de San Miguel de Allende. Activa la ubicación para ver tu zona."
                    : "Location off: showing San Miguel de Allende weather. Enable location for your area."
                }
              >
                {es
                  ? "Ubicación aprox. (SMA) · activa ubicación para tu zona"
                  : "Approx. (San Miguel de Allende) · enable location"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 py-0.5 px-3 rounded-xl bg-white/90 border border-[#E5E0D8] shadow-sm">
          <span className="text-2xl leading-none" aria-hidden title={weatherEmoji(data.current.code, data.current.isDay)}>
            {weatherEmoji(data.current.code, data.current.isDay)}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
              {es ? "Hoy" : "Today"}
            </p>
            <p className="text-lg font-bold font-tabular-nums text-[#1B4332] leading-none">
              {t(data.current.temp)}
            </p>
            {today && (
              <p className="text-[11px] text-[#6B7280] mt-0.5 font-medium font-tabular-nums">
                <span className="text-orange-600">{t(today.max)}</span>
                <span className="mx-1 text-[#D1D5DB]">/</span>
                <span className="text-sky-700">{t(today.min)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 -mr-1 flex-[2_1_12rem]">
          {next.map((d) => (
            <div
              key={d.date}
              className="flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl bg-white/80 border border-[#E5E0D8] min-w-[4.25rem]"
            >
              <span className="text-[10px] font-semibold text-[#6B7280] capitalize">
                {weekdayShort(d.date, tz, locale)}
              </span>
              <span className="text-lg leading-none my-0.5" aria-hidden>
                {weatherEmoji(d.code, true)}
              </span>
              <span className="text-[11px] font-semibold font-tabular-nums text-orange-600">{t(d.max)}</span>
              <span className="text-[10px] font-medium font-tabular-nums text-sky-700">{t(d.min)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
