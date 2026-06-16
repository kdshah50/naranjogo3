"use client";

import { useCart } from "@/components/cart/CartContext";
import type { Lang } from "@/lib/i18n-lang";

export default function AddToCartButton({
  listingId,
  titleEs,
  priceMxnCents,
  lang = "es",
}: {
  listingId: string;
  titleEs: string;
  priceMxnCents: number;
  lang?: Lang;
}) {
  const { addItem } = useCart();
  const label = lang === "en" ? "Add to cart" : "Agregar al carrito";
  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          listingId,
          titleEs,
          priceMxnCents,
          qty: 1,
        })
      }
      className="w-full py-3 rounded-xl border-2 border-[#D4A017] text-[#1B4332] font-semibold text-sm hover:bg-[#FDF8F1] transition-colors"
    >
      {label}
    </button>
  );
}
