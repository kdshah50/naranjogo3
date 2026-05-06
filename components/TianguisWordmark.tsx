import Image from "next/image";
import Link from "next/link";

const CREST = "/tianguis-crest.jpg";

export type TianguisWordmarkVariant = "header" | "footer" | "auth";

/**
 * Crest + “Tianguis✦” wordmark. Used site-wide (Header, login, footer).
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

  const typography =
    variant === "header"
      ? {
          t1: "font-serif text-xl font-bold text-[#1B4332]",
          t2: "font-serif text-lg text-[#1C1917]",
          star: "text-[#D4A017] text-xs font-bold ml-0.5",
        }
      : variant === "auth"
        ? {
            t1: "font-serif text-3xl font-bold text-[#1B4332]",
            t2: "font-serif text-2xl text-[#1C1917]",
            star: "text-[#D4A017] text-sm font-bold ml-0.5 mt-1",
          }
        : {
            t1: "font-serif text-xs font-bold text-[#1B4332]",
            t2: "font-serif text-xs text-[#1C1917]",
            star: "text-[#D4A017] text-[10px] font-bold ml-0.5",
          };

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
      {/* Single word unit — no flex gap between T and ianguis */}
      <span className="inline-flex items-baseline gap-0 whitespace-nowrap leading-none">
        <span className={typography.t1}>T</span>
        <span className={typography.t2}>ianguis</span>
      </span>
      <span className={typography.star}>✦</span>
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
