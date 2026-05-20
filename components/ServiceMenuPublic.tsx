import type { ServiceMenu } from "@/lib/listing-service-menu";
import {
  DEFAULT_INSPECTION_DISCLAIMER_EN,
  DEFAULT_INSPECTION_DISCLAIMER_ES,
} from "@/lib/listing-service-menu";

/**
 * Public, read-only rendering of a seller's service menu (e.g. tailoring).
 *
 * Shown on the listing detail page when `listing.service_menu` is non-empty.
 * Sellers without a menu keep the legacy single-price layout unchanged.
 */
export default function ServiceMenuPublic({
  menu,
  lang = "es",
}: {
  menu: ServiceMenu | null | undefined;
  lang?: "es" | "en";
}) {
  if (!menu || !Array.isArray(menu.items) || menu.items.length === 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const heading = lang === "en" ? "Service menu" : "Menú de servicios";
  const subheading =
    lang === "en"
      ? "Fixed prices per service. Build a custom quote in chat."
      : "Precios fijos por servicio. Solicita un presupuesto en el chat.";
  const disclaimer =
    (lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ??
    (lang === "en" ? DEFAULT_INSPECTION_DISCLAIMER_EN : DEFAULT_INSPECTION_DISCLAIMER_ES);

  return (
    <section className="mb-4 rounded-2xl border border-[#E5E0D8] bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h2 className="font-serif text-lg font-bold text-[#1B4332]">{heading}</h2>
        <p className="text-xs text-[#6B7280]">{subheading}</p>
      </header>

      <ul className="divide-y divide-[#F2EDE3]">
        {menu.items.map((item) => {
          const label = (lang === "en" && item.name_en) || item.name_es;
          return (
            <li
              key={item.sku}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 text-[#1C1917]">{label}</span>
              <span className="shrink-0 font-semibold text-[#1B4332]">
                {formatter.format(item.price_mxn_cents / 100)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 rounded-lg bg-[#FFFBEB] px-3 py-2 text-xs italic text-[#78350F]">
        {disclaimer}
      </p>
    </section>
  );
}
