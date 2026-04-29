export interface ListingCard {
  id: string;
  title: string;
  price_mxn: number;
  category_id: string;
  condition: string;
  location_city: string | null;
  colonia_label: string | null;
  photo_url: string | null;
  /** Optional coords for map view (from listings.location_lat/lng). */
  location_lat?: number | null;
  location_lng?: number | null;
  /** Great-circle distance from browse/search reference (km). Mexico uses km. */
  dist_km?: number | null;
  shipping_available: boolean;
  negotiable: boolean;
  seller_name: string;
  seller_badge: string;
  /** INE/identity checked by team — stronger than phone-only. */
  seller_ine_verified: boolean;
  /** RFC reviewed by admin (tax ID); optional complement to INE. */
  seller_rfc_verified: boolean;
  /** WhatsApp/OTP verified (number holds); does not mean ID reviewed. */
  seller_phone_verified: boolean;
  /** Listing passed admin approval (is_verified) — fallback chip when seller flags missing. */
  listing_admin_verified?: boolean;
  payment_methods: string[] | null;
}

export const PAYMENT_METHODS_MX: Record<string, { label: string; icon: string; desc: string }> = {
  efectivo:     { label: "Efectivo",        icon: "💵", desc: "Pago en efectivo al recibir el servicio" },
  spei:         { label: "SPEI",            icon: "🏦", desc: "Transferencia bancaria instantánea" },
  oxxo:         { label: "OXXO Pay",        icon: "🏪", desc: "Pago en tienda OXXO con referencia" },
  mercadopago:  { label: "Mercado Pago",    icon: "💳", desc: "Pago con tarjeta o saldo Mercado Pago" },
  whatsapp:     { label: "Acordar por WhatsApp", icon: "💬", desc: "Coordinar método de pago por WhatsApp" },
};
