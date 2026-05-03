import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import SellerReviews, { RatingSummary } from "@/components/SellerReviews";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { idMatchVariantsForIn, postgrestInFilter } from "@/lib/user-id-variants";

function fmtMXN(centavos: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(centavos / 100);
}

function TrustBadge({ badge }: { badge: string }) {
  const styles: Record<string, { label: string; color: string; bg: string; desc: string }> = {
    diamond: { label: "Diamond",    color: "#1D4ED8", bg: "#EFF6FF", desc: "10+ reseñas · ★ 4.0+" },
    gold:    { label: "Gold",       color: "#92400E", bg: "#FEF3C7", desc: "3+ reseñas · ★ 3.5+" },
    bronze:  { label: "Bronze",     color: "#78350F", bg: "#FEF9EE", desc: "Teléfono verificado" },
    none:    { label: "Verificado", color: "#065F46", bg: "#ECFDF5", desc: "Cuenta activa" },
  };
  const s = styles[badge] ?? styles.none;
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ color: s.color, background: s.bg }}>{s.label}</span>
      <span className="text-xs" style={{ color: s.color }}>{s.desc}</span>
    </div>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-[#F4F0EB] rounded-2xl p-4 text-center flex-1">
      <div className="text-2xl font-bold text-[#1B4332]">{value}</div>
      <div className="text-xs text-[#6B7280] mt-0.5">{label}</div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supaUrl = getSupabaseUrl();
  const h = getServiceRoleRestHeaders();
  const v = idMatchVariantsForIn(params.id);
  const fil = postgrestInFilter(v);
  if (!fil) return { title: "Vendedor - Naranjogo" };
  const res = await fetch(`${supaUrl}/rest/v1/users?id=${fil}&select=display_name,trust_badge`, {
    headers: h,
    cache: "no-store",
  });
  const rows = res.ok ? await res.json() : [];
  const user = rows[0];
  if (!user) return { title: "Vendedor - Naranjogo" };
  return { title: `${user.display_name ?? "Vendedor"} - Naranjogo`, description: "Perfil del vendedor en Naranjogo." };
}

export default async function SellerPage({ params }: { params: { id: string } }) {
  const supaUrl = getSupabaseUrl();
  const h = getServiceRoleRestHeaders();

  const idVariants = idMatchVariantsForIn(params.id);
  const idIn = postgrestInFilter(idVariants);
  if (!idIn) notFound();

  const sellerRes = await fetch(
    `${supaUrl}/rest/v1/users?id=${idIn}&select=id,display_name,avatar_url,trust_badge,ine_verified,rfc_verified,phone_verified,created_at`,
    { headers: h, cache: "no-store" }
  );
  const sellerRows = sellerRes.ok ? await sellerRes.json() : [];
  const seller = sellerRows[0];
  if (!seller) notFound();

  const sellerKey = seller.id as string;

  const listingsRes = await fetch(
    `${supaUrl}/rest/v1/listings?seller_id=${idIn}&status=eq.active&order=created_at.desc&select=id,title_es,price_mxn,condition,location_city,photo_urls,shipping_available,negotiable`,
    { headers: h, cache: "no-store" }
  );
  const listings = listingsRes.ok ? await listingsRes.json() : [];

  const soldRes = await fetch(
    `${supaUrl}/rest/v1/listings?seller_id=${idIn}&status=eq.sold&select=id`,
    { headers: h, cache: "no-store" }
  );
  const sold = soldRes.ok ? await soldRes.json() : [];

  const reviewsRes = await fetch(
    `${supaUrl}/rest/v1/seller_reviews?seller_id=${idIn}&select=rating`,
    { headers: h, cache: "no-store" }
  );
  const reviewRows: { rating: number }[] = reviewsRes.ok ? await reviewsRes.json() : [];
  const reviewCount = reviewRows.length;
  const avgRating =
    reviewCount > 0
      ? Math.round((reviewRows.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
      : 0;

  const memberSince = new Date(seller.created_at).getFullYear();
  const initials = (seller.display_name ?? "V").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1B4332] mb-6 transition-colors">
          Volver al inicio
        </Link>
        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-8 mb-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center text-white text-3xl font-bold shadow-lg">
              {initials}
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-[#1C1917] mb-1">{seller.display_name ?? "Vendedor"}</h1>
              <p className="text-sm text-[#6B7280] mb-3">Miembro desde {memberSince}</p>
              <TrustBadge badge={seller.trust_badge ?? "none"} />
              {reviewCount > 0 && (
                <RatingSummary average={avgRating} total={reviewCount} />
              )}
            </div>
            <div className="flex gap-4 text-xs text-[#6B7280]">
              <span className={seller.phone_verified ? "text-[#059669]" : ""}>{seller.phone_verified ? "+" : "o"} Telefono</span>
              <span className={seller.ine_verified ? "text-[#059669]" : ""}>{seller.ine_verified ? "+" : "o"} INE</span>
              <span className={seller.rfc_verified ? "text-[#059669]" : ""}>{seller.rfc_verified ? "+" : "o"} RFC</span>
            </div>
            <div className="flex gap-3 w-full mt-2">
              <StatCard value={listings.length} label="Activos" />
              <StatCard value={sold.length} label="Vendidos" />
              <StatCard value={reviewCount} label="Reseñas" />
            </div>
          </div>
        </div>
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-2xl p-4 mb-6 flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold text-[#065F46]">Compra Protegida</p>
            <p className="text-xs text-[#047857]">Artículos cubiertos por Compra Protegida.</p>
          </div>
        </div>

        {/* Badge progression */}
        <div className="bg-white border border-[#E5E0D8] rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-bold text-[#1C1917] mb-3">Nivel de confianza</h3>
          <div className="space-y-2">
            {([
              { badge: "bronze", label: "Bronze", req: "Teléfono verificado", met: true },
              { badge: "gold", label: "Gold", req: "3+ reseñas · promedio ≥ 3.5", met: reviewCount >= 3 && avgRating >= 3.5 },
              { badge: "diamond", label: "Diamond", req: "10+ reseñas · promedio ≥ 4.0", met: reviewCount >= 10 && avgRating >= 4.0 },
            ] as const).map((tier) => {
              const active = (seller.trust_badge ?? "none") === tier.badge
                || ({"diamond": ["diamond"], "gold": ["gold", "diamond"], "bronze": ["bronze", "gold", "diamond"]}[tier.badge]?.includes(seller.trust_badge ?? "none"));
              return (
                <div key={tier.badge} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? "bg-[#F4F0EB]" : ""}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${tier.met ? "border-emerald-500 bg-emerald-500" : "border-[#D1D5DB]"}`}>
                    {tier.met && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-[#1C1917]">{tier.label}</span>
                    <span className="text-xs text-[#6B7280] ml-2">{tier.req}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {reviewCount < 10 && (
            <p className="text-[10px] text-[#9CA3AF] mt-3">
              {reviewCount < 3
                ? `${3 - reviewCount} reseña${3 - reviewCount !== 1 ? "s" : ""} más para Gold`
                : `${10 - reviewCount} reseña${10 - reviewCount !== 1 ? "s" : ""} más para Diamond`}
            </p>
          )}
        </div>
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1C1917] mb-4">
            Articulos activos <span className="ml-2 text-sm font-normal text-[#6B7280]">({listings.length})</span>
          </h2>
          {listings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-[#E5E0D8]">
              <p className="text-[#6B7280]">Este vendedor no tiene articulos activos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {listings.map((listing: any) => (
                <Link key={listing.id} href={`/listing/${listing.id}`} className="group">
                  <div className="bg-white rounded-2xl overflow-hidden border border-[#E5E0D8] hover:shadow-lg transition-all duration-200">
                    <div className="relative aspect-[4/3] bg-[#F4F0EB]">
                      {listing.photo_urls?.[0] ? (
                        <Image src={listing.photo_urls[0]} alt={listing.title_es} fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-4xl text-[#E5E0D8]">box</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-base font-bold text-[#1C1917] mb-0.5">{fmtMXN(listing.price_mxn)}</p>
                      <p className="text-xs text-[#374151] line-clamp-2 leading-snug">{listing.title_es}</p>
                      {listing.location_city && <p className="text-[10px] text-[#9CA3AF] mt-1">{listing.location_city}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Reviews */}
        <div className="mt-8">
          <h2 className="font-serif text-xl font-bold text-[#1C1917] mb-4">
            Reseñas {reviewCount > 0 && <span className="ml-2 text-sm font-normal text-[#6B7280]">({reviewCount})</span>}
          </h2>
          <SellerReviews sellerId={sellerKey} />
        </div>
      </div>
    </main>
  );
}
