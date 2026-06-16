import type { Lang } from "@/lib/i18n-lang";

export const LISTING_PAGE_COPY = {
  es: {
    negotiable: "Negociable",
    shipping: "Envío disponible",
    memberSince: "Miembro desde",
    seller: "Vendedor",
    provider: "Proveedor",
    cartHint:
      "O compra por carrito: verás comisión (admin), IVA y total antes de pagar. Con Stripe Connect activo para vendedores, el subtotal va al vendedor; si no, el cargo es a la plataforma (reparto manual).",
    packageRebookHint:
      "Un solo pago de tarifa de Naranjogo cubre todo el plan. Agenda cada visita en los mensajes de la app. Vuelve a reservar en la app para mantener descuentos por lealtad y la garantía.",
  },
  en: {
    negotiable: "Negotiable",
    shipping: "Shipping available",
    memberSince: "Member since",
    seller: "Seller",
    provider: "Provider",
    cartHint:
      "Or buy via cart: you’ll see commission (admin), VAT, and total before paying. With Stripe Connect enabled for sellers, the subtotal goes to the seller; otherwise the charge is to the platform (manual payout).",
    packageRebookHint:
      "One Naranjogo platform fee unlocks this whole plan. Schedule each visit in app messages. Rebook through Naranjogo to keep loyalty discounts and guarantee protection.",
  },
} as const;

export function listingPageCopy(lang: Lang) {
  return LISTING_PAGE_COPY[lang];
}
