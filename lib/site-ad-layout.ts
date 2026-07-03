/** How much horizontal room to reserve for future on-site ads / partner modules. */
export type SiteAdLayoutMode = "off" | "gutters" | "slots";

export type SiteAdPlacement = "leaderboard" | "rail-left" | "rail-right" | "footer-banner";

export function siteAdLayoutMode(): SiteAdLayoutMode {
  const raw = process.env.NEXT_PUBLIC_SITE_AD_LAYOUT?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "slots" || raw === "true" || raw === "1") return "slots";
  return "gutters";
}

/** Paths where ads / side gutters would hurt conversion or active-trip UX. */
export function siteAdLayoutHiddenForPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.split("?")[0] ?? pathname;
  if (p.startsWith("/admin")) return true;
  if (p.startsWith("/auth")) return true;
  if (p === "/viaje" || p.startsWith("/viaje/")) return true;
  if (p === "/conductor/viajes" || p.startsWith("/conductor/viajes/")) return true;
  if (p.startsWith("/messages")) return true;
  if (p.startsWith("/booking/success")) return true;
  if (p.startsWith("/cart/success")) return true;
  return false;
}

export function siteAdRailWidthClass(mode: SiteAdLayoutMode): string {
  if (mode === "off") return "";
  if (mode === "gutters") return "w-0 xl:w-16 2xl:w-24";
  return "w-0 xl:w-[140px] 2xl:w-[160px]";
}
