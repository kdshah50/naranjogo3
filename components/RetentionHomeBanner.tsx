import { getHomeRetentionBannerText } from "@/lib/retention-copy";

export default function RetentionHomeBanner({ lang }: { lang: "es" | "en" }) {
  const text = getHomeRetentionBannerText(lang);
  if (!text) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 -mt-1 mb-3">
      <div
        className="rounded-xl bg-gradient-to-r from-amber-50 to-[#FDF6E3] border border-amber-200/80 px-4 py-2.5 text-sm text-amber-950 text-center leading-snug shadow-sm"
        role="note"
      >
        {text}
      </div>
    </div>
  );
}
