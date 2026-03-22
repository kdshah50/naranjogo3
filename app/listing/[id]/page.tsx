import { createSupabaseServerClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// Generate per-listing SEO metadata — key for Google indexing
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("listings")
    .select("title_es, description_es, photo_urls, price_mxn")
    .eq("id", params.id)
    .single();

  if (!data) return { title: "Artículo no encontrado — Tianguis" };

  const price = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(data.price_mxn / 100);

  return {
    title: `${data.title_es} — ${price} | Tianguis`,
    description: data.description_es?.slice(0, 160) ?? `${data.title_es} en venta en Tianguis`,
    openGraph: {
      title: data.title_es,
      description: data.description_es ?? "",
      images: data.photo_urls?.[0] ? [{ url: data.photo_urls[0], width: 800, height: 600 }] : [],
    },
  };
}

export default async function ListingPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  // Fetch listing + seller
  const { data: listing } = await supabase
    .from("listings")
    .select(`
      *, users ( id, display_name, avatar_url, trust_badge, ine_verified, created_at )
    `)
    .eq("id", params.id)
    .eq("status", "active")
    .single();

  if (!listing) notFound();

  // Increment view count (fire-and-forget)
  supabase.rpc("increment_view_count", { listing_id: params.id }).then(() => {});

  const price = new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(listing.price_mxn / 100);

  const seller = listing.users as any;

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Photo */}
        {listing.photo_urls?.[0] && (
          <img
            src={listing.photo_urls[0]}
            alt={listing.title_es}
            className="w-full h-80 object-cover rounded-2xl mb-6"
          />
        )}

        {/* Price + title */}
        <div className="flex items-start justify-between mb-3">
          <span className="text-3xl font-bold text-[#1B4332]">{price}</span>
          {listing.negotiable && (
            <span className="text-sm text-[#6B7280] italic">Negociable</span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-[#1C1917] mb-4">{listing.title_es}</h1>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-6">
          {listing.shipping_available && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
              📦 Envío disponible
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#F4F0EB] text-[#6B7280]">
            {listing.condition}
          </span>
          {listing.location_city && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#F4F0EB] text-[#6B7280]">
              📍 {listing.location_city}
            </span>
          )}
        </div>

        {/* Description */}
        {listing.description_es && (
          <p className="text-[#374151] leading-relaxed mb-6">{listing.description_es}</p>
        )}

        {/* Seller card */}
        {seller && (
          <div className="bg-[#F4F0EB] rounded-xl p-4 mb-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {seller.display_name?.[0] ?? "V"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{seller.display_name ?? "Vendedor"}</span>
                {seller.ine_verified && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    ✓ Verificado
                  </span>
                )}
              </div>
              <span className="text-xs text-[#6B7280]">
                Miembro desde {new Date(seller.created_at).getFullYear()}
              </span>
            </div>
          </div>
        )}

        {/* Buyer protection */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Compra Protegida</p>
            <p className="text-xs text-emerald-700">Tu pago está protegido hasta confirmar tu compra</p>
          </div>
        </div>

        {/* CTA */}
        <button className="w-full py-4 rounded-xl bg-[#1B4332] text-white font-semibold text-base hover:bg-[#2D6A4F] transition-colors">
          Contactar vendedor
        </button>
      </div>
    </main>
  );
}
