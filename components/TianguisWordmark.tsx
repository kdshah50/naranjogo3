import Image from "next/image";
import Link from "next/link";

const CREST = "/tianguis-crest.jpg";

export type TianguisWordmarkVariant = "header" | "footer" | "auth";

/**
 * Crest + “Tianguis✦” wordmark. “Tianguis” is one word: T is styled inline with no break/space before ianguis.
 */
export default function TianguisWordmark({
  variant,
  asLink = true,
  className = "",
}: {
  variant: TianguisWordmarkVariant;
  asLink?: boolean;
  className?: string;
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

  if (asLink) {
    return (
      <Link href="/" aria-label="Tianguis — inicio" className={wrap}>
        {inner}
      </Link>
    );
  }
  return <span className={wrap}>{inner}</span>;
}
