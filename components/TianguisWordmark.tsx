import Image from "next/image";
import Link from "next/link";

const CREST = "/tianguis-crest.jpg";

export type TianguisWordmarkVariant = "header" | "footer" | "auth";

const BRAND_STORY = {
  title: "TIANGUIS",
  subtitle: "El Mercado Digital de México",
  enPrimary:
    "Tianguis in this venture is primarily a referral system for professional services and legitimate businesses, rather than a platform that promotes farmer and flea market activities, although this is inevitably a secondary purpose.",
  esPrimary:
    "Tianguis en esta iniciativa es principalmente un sistema de referencia para servicios profesionales y negocios legítimos, más que una plataforma que promueva actividades de agricultores y mercadillos, aunque esto es inevitablemente un propósito secundario.",
  enClosing:
    "Tianguis is a mobile-first digital marketplace purpose-built for the Mexican market. It combines a bilingual (ES – Español / EN – English) buying and selling of services experience.",
};

/**
 * Crest + “Tianguis✦” wordmark. “Tianguis” is one word: T is styled inline with no break/space before ianguis.
 */
export default function TianguisWordmark({
  variant,
  asLink = true,
  className = "",
  showHoverStory = variant === "header",
}: {
  variant: TianguisWordmarkVariant;
  asLink?: boolean;
  className?: string;
  /** Header hover panel with brand story (desktop hover). */
  showHoverStory?: boolean;
}) {
  const imgClass =
    variant === "header"
      ? "h-[30px] w-[23px] sm:h-[34px] sm:w-[26px]"
      : variant === "auth"
        ? "h-11 w-[34px] sm:h-12 sm:w-[37px]"
        : "h-5 w-[15px]";

  /** One wrapper + T in span + “ianguis” as immediate text (no JSX whitespace). */
  const word =
    variant === "header" ? (
      <span className="font-serif text-lg text-[#1C1917] leading-none whitespace-nowrap">
        <span className="text-xl font-bold text-[#1B4332]">T</span>ianguis
      </span>
    ) : variant === "auth" ? (
      <span className="font-serif text-2xl text-[#1C1917] leading-none whitespace-nowrap">
        <span className="text-3xl font-bold text-[#1B4332]">T</span>ianguis
      </span>
    ) : (
      <span className="font-serif text-xs text-[#1C1917] leading-none whitespace-nowrap">
        <span className="text-xs font-bold text-[#1B4332]">T</span>ianguis
      </span>
    );

  const starClass =
    variant === "header"
      ? "text-[#D4A017] text-xs font-bold ml-0.5 shrink-0"
      : variant === "auth"
        ? "text-[#D4A017] text-sm font-bold ml-0.5 mt-0.5 shrink-0"
        : "text-[#D4A017] text-[10px] font-bold ml-0.5 shrink-0";

  const wrap = `inline-flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${className}`;

  const inner = (
    <>
      <Image
        src={CREST}
        alt=""
        width={786}
        height={1024}
        className={`${imgClass} object-contain flex-shrink-0`}
        sizes={variant === "header" ? "34px" : variant === "auth" ? "48px" : "20px"}
        priority={variant === "header"}
      />
      {word}
      <span className={starClass}>✦</span>
    </>
  );

  const hoverPanel = showHoverStory ? (
    <div
      className="pointer-events-none absolute left-0 top-full z-[60] pt-2 opacity-0 invisible translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 max-sm:hidden"
      role="tooltip"
    >
      <div
        className="w-[min(100vw-2rem,22rem)] rounded-xl border border-[#1B4332]/15 bg-gradient-to-br from-[#FDF8F1] via-white to-[#E8F5E9] p-4 shadow-lg shadow-[#1B4332]/10 text-left"
      >
        <p className="font-serif text-lg font-bold tracking-wide text-[#1B4332]">{BRAND_STORY.title}</p>
        <p className="text-xs font-semibold text-[#D4A017] mt-0.5 mb-3">{BRAND_STORY.subtitle}</p>
        <p className="text-[11px] leading-relaxed text-[#374151] mb-2.5 border-l-2 border-[#1B4332]/30 pl-2.5">
          {BRAND_STORY.enPrimary}
        </p>
        <p className="text-[11px] leading-relaxed text-[#1B4332]/90 mb-2.5 border-l-2 border-[#D4A017]/60 pl-2.5">
          {BRAND_STORY.esPrimary}
        </p>
        <p className="text-[11px] leading-relaxed text-[#5C5345] bg-[#1B4332]/5 rounded-lg px-2.5 py-2">
          {BRAND_STORY.enClosing}
        </p>
      </div>
    </div>
  ) : null;

  if (asLink) {
    return (
      <div className="relative group flex-shrink-0">
        <Link href="/" aria-label="Tianguis — inicio" className={wrap}>
          {inner}
        </Link>
        {hoverPanel}
      </div>
    );
  }
  return (
    <span className={`relative group ${wrap}`}>
      {inner}
      {hoverPanel}
    </span>
  );
}
