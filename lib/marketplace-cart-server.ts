import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { isServicesListing } from "@/lib/listing-category";
import type { CartLineInput } from "@/lib/marketplace-cart-pricing";
import { computeCartPricing } from "@/lib/marketplace-cart-pricing";

export type CartItemPayload = { listingId: string; qty: number };

export type { CartLineInput, CartPricingBreakdown } from "@/lib/marketplace-cart-pricing";
export { computeCartPricing } from "@/lib/marketplace-cart-pricing";

export async function resolveCartLines(
  supabase: SupabaseClient,
  items: CartItemPayload[]
): Promise<
  | { ok: true; sellerId: string; lines: CartLineInput[] }
  | { ok: false; status: number; error: string }
> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, status: 400, error: "Carrito vacío" };
  }

  const normalized: { listingId: string; qty: number }[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const listingId = String(raw?.listingId ?? "").trim();
    const qty = Math.max(1, Math.min(99, Math.floor(Number(raw?.qty) || 1)));
    if (!listingId) continue;
    if (seen.has(listingId)) {
      return { ok: false, status: 400, error: "No dupliques el mismo anuncio en el carrito" };
    }
    seen.add(listingId);
    normalized.push({ listingId, qty });
  }

  if (normalized.length === 0) {
    return { ok: false, status: 400, error: "Artículos inválidos" };
  }

  const ids = normalized.map((n) => n.listingId);
  const { data: rows, error } = await supabase
    .from("listings")
    .select("id,seller_id,category_id,status,is_verified,price_mxn,commission_pct,title_es")
    .in("id", ids);

  if (error) {
    console.error("[cart] listings load", error);
    return { ok: false, status: 500, error: "No se pudieron cargar los anuncios" };
  }

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const lines: CartLineInput[] = [];
  let sellerId: string | null = null;

  for (const { listingId, qty } of normalized) {
    const row = byId.get(listingId);
    if (!row) {
      return { ok: false, status: 404, error: `Anuncio no encontrado: ${listingId}` };
    }
    if (row.status !== "active" || !row.is_verified) {
      return { ok: false, status: 400, error: "Un artículo no está disponible" };
    }
    if (isServicesListing(row)) {
      return { ok: false, status: 400, error: "Los servicios usan reserva y tarifa de contacto, no el carrito" };
    }
    const sid = row.seller_id as string | null;
    if (!sid) {
      return { ok: false, status: 400, error: "Anuncio sin vendedor" };
    }
    if (sellerId == null) sellerId = sid;
    if (sellerId !== sid) {
      return { ok: false, status: 400, error: "Solo un vendedor por compra (por ahora)" };
    }

    const unit = Number(row.price_mxn) || 0;
    if (unit <= 0) {
      return { ok: false, status: 400, error: "Un artículo tiene precio inválido" };
    }

    lines.push({
      listingId: row.id as string,
      qty,
      unitPriceMxnCents: unit,
      commissionPct: row.commission_pct as number | null,
      titleEs: String(row.title_es ?? ""),
    });
  }

  if (!sellerId) {
    return { ok: false, status: 400, error: "Sin vendedor" };
  }

  return { ok: true, sellerId, lines };
}

export async function loadSellerConnectId(
  supabase: SupabaseClient,
  sellerId: string
): Promise<string | null> {
  const idVars = idMatchVariantsForIn(sellerId);
  const { data, error } = await supabase
    .from("users")
    .select("stripe_connect_account_id")
    .in("id", idVars)
    .maybeSingle();
  if (error || !data) return null;
  const id = data.stripe_connect_account_id as string | null;
  return id && id.startsWith("acct_") ? id : null;
}
