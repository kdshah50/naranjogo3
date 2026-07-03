"use client";

import type { SiteAdPlacement } from "@/lib/site-ad-layout";
import { useAppLang } from "@/hooks/use-app-lang";

type Props = {
  placement: SiteAdPlacement;
  /** When true, show a labeled placeholder (slots mode). */
  showPlaceholder?: boolean;
};

const PLACEHOLDER_COPY: Record<SiteAdPlacement, { es: string; en: string }> = {
  leaderboard: {
    es: "Espacio publicitario — parte superior",
    en: "Ad space — top banner",
  },
  "rail-left": {
    es: "Espacio publicitario — lateral",
    en: "Ad space — side",
  },
  "rail-right": {
    es: "Espacio publicitario — lateral",
    en: "Ad space — side",
  },
  "footer-banner": {
    es: "Espacio publicitario — pie de página",
    en: "Ad space — footer",
  },
};

const SIZE_CLASS: Record<SiteAdPlacement, string> = {
  leaderboard: "w-full min-h-[72px] md:min-h-[90px] max-h-[120px]",
  "rail-left": "w-full min-h-[400px] xl:min-h-[480px]",
  "rail-right": "w-full min-h-[400px] xl:min-h-[480px]",
  "footer-banner": "w-full min-h-[72px] md:min-h-[90px] max-h-[120px]",
};

/**
 * Reserved DOM mount for third-party ad scripts or partner widgets.
 * `data-naranjogo-ad-slot` keeps selectors stable for future AdSense / direct-sold tags.
 */
export default function SiteAdSlot({ placement, showPlaceholder = false }: Props) {
  const lang = useAppLang();
  const es = lang === "es";
  const label = PLACEHOLDER_COPY[placement][es ? "es" : "en"];

  return (
    <div
      className={`site-ad-slot ${SIZE_CLASS[placement]} flex items-center justify-center`}
      data-naranjogo-ad-slot={placement}
      aria-hidden={!showPlaceholder}
    >
      {showPlaceholder ? (
        <div className="w-full h-full rounded-xl border border-dashed border-[#D6D3D1] bg-[#FAFAF9]/80 flex items-center justify-center px-3 py-4 text-center">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[#A8A29E] leading-snug">
            {label}
          </span>
        </div>
      ) : null}
    </div>
  );
}
