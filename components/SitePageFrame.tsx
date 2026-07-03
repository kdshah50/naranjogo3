"use client";

import { usePathname } from "next/navigation";
import SiteAdSlot from "@/components/SiteAdSlot";
import {
  siteAdLayoutHiddenForPath,
  siteAdLayoutMode,
  siteAdRailWidthClass,
  type SiteAdLayoutMode,
} from "@/lib/site-ad-layout";

const MODE: SiteAdLayoutMode = siteAdLayoutMode();

function RailColumn({
  side,
  mode,
  showSlots,
}: {
  side: "rail-left" | "rail-right";
  mode: SiteAdLayoutMode;
  showSlots: boolean;
}) {
  if (mode === "off") return null;
  return (
    <aside
      className={`hidden xl:block shrink-0 ${siteAdRailWidthClass(mode)} sticky top-[3.75rem] self-start max-h-[calc(100vh-4.5rem)] overflow-hidden`}
      aria-label={side === "rail-left" ? "Left ad column" : "Right ad column"}
    >
      {showSlots ? (
        <SiteAdSlot placement={side} showPlaceholder />
      ) : (
        <div className="h-full min-h-[1px]" aria-hidden />
      )}
    </aside>
  );
}

export default function SitePageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hidden = siteAdLayoutHiddenForPath(pathname);
  const mode = hidden ? "off" : MODE;
  const showSlots = mode === "slots";

  if (mode === "off") {
    return <div className="flex-1 min-h-0 flex flex-col">{children}</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {showSlots ? (
        <div className="hidden md:block border-b border-[#E5E0D8]/60 bg-[#FDF8F1]">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <SiteAdSlot placement="leaderboard" showPlaceholder />
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0 w-full max-w-[1600px] mx-auto">
        <RailColumn side="rail-left" mode={mode} showSlots={showSlots} />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
        <RailColumn side="rail-right" mode={mode} showSlots={showSlots} />
      </div>

      {showSlots ? (
        <div className="hidden md:block border-t border-[#E5E0D8]/60 bg-[#FDF8F1]">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <SiteAdSlot placement="footer-banner" showPlaceholder />
          </div>
        </div>
      ) : null}
    </div>
  );
}
