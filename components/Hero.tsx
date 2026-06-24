"use client";
import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { COLONIAS, sortedColoniaKeys, detectColoniaInQuery, coloniaLabel } from "@/lib/colonias";

/** Slider top = “no upper cap” in the URL (pmax omitted). Whole MXN pesos. */
const PRICE_MAX_UI = 5_000_000;
const PRICE_SLIDER_STEP = 25_000;

function fmtPesos(n: number, lang: "es" | "en") {
  return new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

const T = {
  es: {
    badge: "CP 37700 • SERVICIOS",
    line1: "eCommerce",
    line2: "con Confianza",
    sub: "Servicios locales verificados en código postal 37700.",
    placeholder: "Ej. plomero en Centro, dentista en Aurora...",
    btn: "Buscar",
    near: "Cerca de mí",
    chipLabel: "Buscar por colonia:",
    priceTitle: "Precio (MXN)",
    priceMin: "Mín.",
    priceMax: "Máx.",
    noMax: "Sin límite",
    cleaningChip: "Limpieza del hogar",
    vetChip: "Veterinaria",
    petChip: "Cuidado de mascotas",
    transportChip: "Taxi / transporte",
    tailoringChip: "Arreglos de ropa",
    errandsChip: "Mandados bilingüe",
  },
  en: {
    badge: "ZIP 37700 • SERVICES",
    line1: "eCommerce",
    line2: "with Confidence",
    sub: "Verified local services in ZIP code 37700.",
    placeholder: "E.g. plumber in Centro, dentist in Aurora...",
    btn: "Search",
    near: "Near me",
    chipLabel: "Search by colonia:",
    priceTitle: "Price (MXN)",
    priceMin: "Min.",
    priceMax: "Max.",
    noMax: "No max",
    cleaningChip: "Home cleaning",
    vetChip: "Veterinary",
    petChip: "Pet care",
    transportChip: "Taxi / rides",
    tailoringChip: "Tailoring",
    errandsChip: "Bilingual errands",
  },
};

const HERO_SERVICE_CHIPS = [
  { href: "/arreglos-de-ropa", icon: "🪡", labelKey: "tailoringChip" as const, featured: false },
  { href: "/cuidado-mascotas", icon: "🐕", labelKey: "petChip" as const, featured: false },
  { href: "/limpieza-del-hogar", icon: "🧹", labelKey: "cleaningChip" as const, featured: true },
  { href: "/mandados-bilingue", icon: "📋", labelKey: "errandsChip" as const, featured: false },
  { href: "/transporte", icon: "🚕", labelKey: "transportChip" as const, featured: false },
  { href: "/veterinaria", icon: "🐾", labelKey: "vetChip" as const, featured: false },
] as const;

function HeroInner({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(PRICE_MAX_UI);
  const [geoLoading, setGeoLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const lang = (params.get("lang") || "es") as "es" | "en";
  const t = T[lang];
  const activeColonia = params.get("colonia") ?? "";
  const serviceChips = HERO_SERVICE_CHIPS.map((chip) => ({
    ...chip,
    label: t[chip.labelKey],
  })).sort((a, b) =>
    a.label.localeCompare(b.label, lang === "en" ? "en" : "es", { sensitivity: "base" }),
  );

  const priceKey = `${params.get("pmin") ?? ""}|${params.get("pmax") ?? ""}`;
  useEffect(() => {
    const pm = parseInt(params.get("pmin") ?? "0", 10);
    const min = Number.isFinite(pm) && pm > 0 ? Math.min(pm, PRICE_MAX_UI) : 0;
    const px = params.get("pmax");
    let max = PRICE_MAX_UI;
    if (px != null && px !== "") {
      const n = parseInt(px, 10);
      if (Number.isFinite(n) && n > 0) max = Math.min(Math.max(n, min), PRICE_MAX_UI);
    }
    setPriceMin(min);
    setPriceMax(max);
  }, [priceKey, params]);

  const applyPriceToParams = (p: URLSearchParams) => {
    if (priceMin > 0) p.set("pmin", String(priceMin));
    else p.delete("pmin");
    if (priceMax < PRICE_MAX_UI) p.set("pmax", String(priceMax));
    else p.delete("pmax");
  };

  const go = (q: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(params.toString());
    const cat = params.get("category") || "services";
    p.set("category", cat);

    let finalQ = q.trim();
    if (finalQ && !extra.colonia) {
      const detected = detectColoniaInQuery(finalQ);
      if (detected) {
        const c = COLONIAS[detected.coloniaKey];
        p.set("colonia", detected.coloniaKey);
        p.set("lat", String(c.lat));
        p.set("lng", String(c.lng));
        finalQ = detected.cleanedQuery;
      }
    }

    if (finalQ) p.set("q", finalQ); else p.delete("q");
    Object.entries(extra).forEach(([k, v]) => v ? p.set(k, v) : p.delete(k));
    applyPriceToParams(p);
    router.push(`/?${p.toString()}`);
  };

  const setMinSlider = (v: number) => {
    const next = Math.max(0, Math.min(v, PRICE_MAX_UI));
    setPriceMin(next);
    if (next > priceMax) setPriceMax(next);
  };

  const setMaxSlider = (v: number) => {
    const next = Math.max(0, Math.min(v, PRICE_MAX_UI));
    setPriceMax(next);
    if (next < priceMin) setPriceMin(next);
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoLoading(false);
        go(query, { lat: coords.latitude.toFixed(6), lng: coords.longitude.toFixed(6), colonia: "" });
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    );
  };

  const handleColonia = (key: string) => {
    const isActive = activeColonia === key;
    if (isActive) {
      go(query, { colonia: "" });
    } else {
      const c = COLONIAS[key];
      go(query, { colonia: key, lat: String(c.lat), lng: String(c.lng) });
    }
  };

  return (
    <div className="relative bg-gradient-to-br from-[#1B4332] via-[#2D6A4F] to-[#1B4332] py-16 px-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#D4A017]/10 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

      <div className="max-w-2xl mx-auto text-center relative z-10">
        <div className="inline-block bg-[#D4A017]/20 rounded-full px-4 py-1.5 mb-4">
          <span className="text-[#F0C040] text-xs font-bold tracking-widest">✦ {t.badge}</span>
        </div>

        <h1 className="font-serif text-4xl md:text-5xl font-bold text-white leading-tight mb-3">
          {t.line1}<br />{t.line2}
        </h1>
        <p className="text-white/70 text-base mb-6">{t.sub}</p>

        {/* Search bar */}
        <div className="bg-white rounded-2xl p-1.5 flex items-center gap-2 shadow-2xl mb-3">
          <span className="text-lg pl-3">🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && go(query)}
            placeholder={t.placeholder}
            className="flex-1 bg-transparent text-[#1C1917] placeholder-[#A8A095] outline-none text-base py-2"
          />
          <button
            onClick={() => go(query)}
            className="bg-[#1B4332] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#2D6A4F] transition-colors whitespace-nowrap"
          >
            {t.btn}
          </button>
        </div>

        {/* Price range — combines with natural-language price phrases in `q` (stricter wins server-side). */}
        <div
          className="rounded-2xl px-4 py-3 mb-3 text-left max-w-xl mx-auto"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)" }}
        >
          <p className="text-[11px] font-bold tracking-wide text-[#F0C040]/90 mb-2">{t.priceTitle}</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] text-white/80 mb-1">
                <span>{t.priceMin}</span>
                <span className="font-semibold text-white">{fmtPesos(priceMin, lang)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={PRICE_MAX_UI}
                step={PRICE_SLIDER_STEP}
                value={priceMin}
                onChange={(e) => setMinSlider(Number(e.target.value))}
                className="w-full accent-[#D4A017] h-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-white/80 mb-1">
                <span>{t.priceMax}</span>
                <span className="font-semibold text-white">
                  {priceMax >= PRICE_MAX_UI ? t.noMax : fmtPesos(priceMax, lang)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={PRICE_MAX_UI}
                step={PRICE_SLIDER_STEP}
                value={priceMax}
                onChange={(e) => setMaxSlider(Number(e.target.value))}
                className="w-full accent-[#D4A017] h-2"
              />
            </div>
          </div>
        </div>

        {/* Service shortcuts — alphabetical by label (below price sliders) */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {serviceChips.map((chip) => (
            <Link
              key={chip.href}
              href={`${chip.href}${lang === "en" ? "?lang=en" : ""}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                chip.featured
                  ? "bg-[#D4A017] text-[#1B4332] hover:bg-[#F0C040] shadow-md"
                  : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/25"
              }`}
            >
              {chip.icon} {chip.label}
            </Link>
          ))}
        </div>

        {/* Near me */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <button
            onClick={handleNearMe}
            disabled={geoLoading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold disabled:opacity-60 transition-all"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
          >
            {geoLoading
              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Localizando...</>
              : <>📍 {t.near}</>
            }
          </button>
        </div>

        {/* Colonia chips */}
        <div className="mt-1 mb-2">
          <span className="text-white/50 text-[11px] font-medium tracking-wide uppercase">
            {t.chipLabel}
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
          {sortedColoniaKeys(lang).map((key) => {
            const c = COLONIAS[key];
            const active = activeColonia === key;
            return (
              <button
                key={key}
                onClick={() => handleColonia(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  active
                    ? "bg-[#D4A017] text-[#1B4332] shadow-md scale-105"
                    : "bg-white/10 text-white/80 hover:bg-white/20 border border-white/20"
                }`}
              >
                📍 {coloniaLabel(key, lang)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Hero({ initialQuery = "" }: { initialQuery?: string }) {
  return (
    <Suspense fallback={<div className="bg-[#1B4332] py-16 h-64" />}>
      <HeroInner initialQuery={initialQuery} />
    </Suspense>
  );
}
