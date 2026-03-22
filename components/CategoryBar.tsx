"use client";
import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { id: "all",        icon: "◈", label: "Todo" },
  { id: "electronics",icon: "📱", label: "Electrónica" },
  { id: "vehicles",   icon: "🚗", label: "Vehículos" },
  { id: "fashion",    icon: "👗", label: "Moda" },
  { id: "home",       icon: "🏠", label: "Hogar" },
  { id: "services",   icon: "🔧", label: "Servicios" },
  { id: "realestate", icon: "🏡", label: "Bienes Raíces" },
  { id: "sports",     icon: "⚽", label: "Deportes" },
];

export default function CategoryBar() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("category") ?? "all";

  const select = (id: string) => {
    const p = new URLSearchParams(params.toString());
    if (id === "all") p.delete("category");
    else p.set("category", id);
    router.push(`/?${p.toString()}`);
  };

  return (
    <div className="bg-white border-b border-[#E5E0D8] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
        <div className="flex gap-1 py-3 min-w-max">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => select(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active === cat.id
                  ? "bg-[#1B4332] text-white"
                  : "bg-[#F4F0EB] text-[#1C1917] hover:bg-[#E5E0D8]"
              }`}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
