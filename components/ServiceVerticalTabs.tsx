"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const VERTICALS = [
  { slug: "limpieza", href: "/limpieza-del-hogar", icon: "🧹", label: { es: "Limpieza", en: "Cleaning" } },
  { slug: "veterinaria", href: "/veterinaria", icon: "🐾", label: { es: "Veterinaria", en: "Veterinary" } },
  { slug: "pet", href: "/cuidado-mascotas", icon: "🐕", label: { es: "Mascotas", en: "Pet care" } },
  { slug: "transporte", href: "/transporte", icon: "🚕", label: { es: "Taxi", en: "Rides" } },
  { slug: "arreglos", href: "/arreglos-de-ropa", icon: "🪡", label: { es: "Arreglos", en: "Tailoring" } },
  { slug: "mandados", href: "/mandados-bilingue", icon: "📋", label: { es: "Mandados", en: "Errands" } },
] as const;

function ServiceVerticalTabsInner() {
  const params = useSearchParams();
  const lang = (params.get("lang") || "es") as "es" | "en";
  const q = (params.get("q") || "").toLowerCase();

  const activeSlug = VERTICALS.find((v) => {
    if (q.includes(v.slug)) return true;
    if (v.slug === "pet" && (q.includes("mascota") || q.includes("paseador"))) return true;
    if (v.slug === "limpieza" && q.includes("limpieza")) return true;
    return false;
  })?.slug;

  return (
    <div className="bg-[#F4F0EB] border-b border-[#E5E0D8]">
      <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
        <div className="flex gap-1 py-2.5 min-w-max items-center">
          {VERTICALS.map((v) => {
            const isActive = activeSlug === v.slug;
            const href = `${v.href}${lang === "en" ? "?lang=en" : ""}`;
            return (
              <Link
                key={v.slug}
                href={href}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-[#1B4332] text-white shadow-sm"
                    : "bg-white text-[#374151] hover:bg-[#E8E3DA] border border-[#E5E0D8]"
                }`}
              >
                <span style={{ fontSize: 15 }}>{v.icon}</span>
                {v.label[lang]}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Six service vertical shortcuts on the home page (cleaning, vet, pet, rides, tailoring, errands). */
export default function ServiceVerticalTabs() {
  return (
    <Suspense fallback={<div className="bg-[#F4F0EB] border-b border-[#E5E0D8] h-12" />}>
      <ServiceVerticalTabsInner />
    </Suspense>
  );
}
