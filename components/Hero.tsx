"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Hero() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (query.trim()) router.push(`/?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="relative bg-gradient-to-br from-[#1B4332] via-[#2D6A4F] to-[#1B4332] py-16 px-4 overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#D4A017]/10 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

      <div className="max-w-2xl mx-auto text-center relative z-10">
        <div className="inline-block bg-[#D4A017]/20 rounded-full px-4 py-1.5 mb-4">
          <span className="text-[#F0C040] text-xs font-bold tracking-widest">
            ✦ BETA • CIUDAD DE MÉXICO
          </span>
        </div>

        <h1 className="font-serif text-4xl md:text-5xl font-bold text-white leading-tight mb-3">
          Compra y vende<br />con confianza
        </h1>
        <p className="text-white/70 text-base mb-8">
          El mercado digital más seguro de México. Sin estafas, sin spam.
        </p>

        <div className="bg-white rounded-2xl p-1.5 flex items-center gap-2 shadow-2xl">
          <span className="text-lg pl-3">🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="¿Qué estás buscando?"
            className="flex-1 bg-transparent text-[#1C1917] placeholder-[#A8A095] outline-none text-base py-2"
          />
          <button
            onClick={handleSearch}
            className="bg-[#1B4332] text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#2D6A4F] transition-colors whitespace-nowrap"
          >
            Buscar
          </button>
        </div>
      </div>
    </div>
  );
}
