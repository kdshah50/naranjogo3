"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const SellModal = dynamic(() => import("./SellModal"), { ssr: false });

export default function Header() {
  const [showSell, setShowSell] = useState(false);

  return (
    <>
      <header className="bg-white border-b border-[#E5E0D8] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex-shrink-0">
            <span className="font-serif text-xl font-bold text-[#1B4332]">T</span>
            <span className="font-serif text-lg text-[#1C1917]">ianguis</span>
            <span className="text-[#D4A017] text-xs font-bold ml-0.5">✦</span>
          </Link>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowSell(true)}
              className="bg-[#D4A017] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#C4900D] transition-colors"
            >
              + Vender
            </button>
          </div>
        </div>
      </header>

      {showSell && <SellModal onClose={() => setShowSell(false)} />}
    </>
  );
}
