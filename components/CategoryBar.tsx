"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MARKETPLACE_CATEGORIES, normalizeBrowseCategory } from "@/lib/marketplace-categories";

function CategoryBarInner() {
  const router = useRouter();
  const params = useSearchParams();
  const lang = (params.get("lang") || "es") as "es" | "en";
  const activeId = normalizeBrowseCategory(params.get("category"));

  const selectCategory = (id: string) => {
    const cat = MARKETPLACE_CATEGORIES.find((c) => c.id === id);
    if (!cat?.browseEnabled) return;
    const p = new URLSearchParams(params.toString());
    p.set("category", id);
    router.push(`/?${p.toString()}`);
  };

  return (
    <div className="bg-white border-b border-[#E5E0D8] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 overflow-x-auto">
        <div className="flex gap-1 py-3 min-w-max items-center">
          {MARKETPLACE_CATEGORIES.filter((cat) => cat.browseEnabled).map((cat) => {
            const isActive = activeId === cat.id;
            return (
              <div key={cat.id} className="relative group">
                <button
                  type="button"
                  onClick={() => selectCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-[#1B4332] text-white cursor-pointer shadow-sm"
                      : "bg-[#F4F0EB] text-[#374151] hover:bg-[#E8E3DA] cursor-pointer"
                  }`}
                >
                  <span
                    className={!isActive ? "grayscale-[0.3]" : ""}
                    style={{ fontSize: 16 }}
                  >
                    {cat.icon}
                  </span>
                  {cat.label[lang]}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CategoryBar() {
  return (
    <Suspense fallback={<div className="bg-white border-b border-[#E5E0D8] h-14" />}>
      <CategoryBarInner />
    </Suspense>
  );
}
