import Image from "next/image";
import type { Lang } from "@/lib/i18n-lang";
import type { BeforeAfterPair } from "@/lib/provider-trust";

export default function ListingBeforeAfterSection({
  pairs,
  lang,
}: {
  pairs: BeforeAfterPair[];
  lang: Lang;
}) {
  if (!pairs.length) return null;

  return (
    <section className="mb-8" aria-labelledby="before-after-heading">
      <h2 id="before-after-heading" className="font-serif text-lg font-bold text-[#1C1917] mb-2">
        {lang === "en" ? "Before / after" : "Antes / después"}
      </h2>
      <p className="text-xs text-[#6B7280] mb-4">
        {lang === "en"
          ? "Photos shared by the provider. Results vary by person and session."
          : "Fotos compartidas por el proveedor. Los resultados varían según cada caso."}
      </p>
      <div className="space-y-6">
        {pairs.map((pair, i) => (
          <div
            key={`${pair.before}-${pair.after}-${i}`}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-[#E5E0D8] overflow-hidden bg-white"
          >
            <figure className="relative">
              <div className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-wide bg-black/55 text-white px-2 py-0.5 rounded">
                {lang === "en" ? "Before" : "Antes"}
              </div>
              <div className="relative aspect-[4/3] bg-[#F4F0EB]">
                <Image
                  src={pair.before}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  unoptimized
                />
              </div>
            </figure>
            <figure className="relative">
              <div className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-wide bg-[#1B4332]/90 text-white px-2 py-0.5 rounded">
                {lang === "en" ? "After" : "Después"}
              </div>
              <div className="relative aspect-[4/3] bg-[#F4F0EB]">
                <Image
                  src={pair.after}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  unoptimized
                />
              </div>
            </figure>
          </div>
        ))}
      </div>
    </section>
  );
}
