import Link from "next/link";
import Image from "next/image";
import { ListingCard } from "@/lib/types";

function fmtMXN(centavos: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(centavos / 100);
}

function TrustBadge({ badge, verified }: { badge: string; verified: boolean }) {
  if (badge === "gold" || badge === "diamond")
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">✓ {badge}</span>;
  if (verified)
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">✓ Verif.</span>;
  return null;
}

export default function ListingGrid({ listings }: { listings: ListingCard[] }) {
  if (!listings.length) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-[#6B7280] text-lg">No hay artículos que coincidan.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {listings.map(listing => (
        <Link key={listing.id} href={`/listing/${listing.id}`} className="group">
          <div className="bg-white rounded-2xl overflow-hidden border border-[#E5E0D8] hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
            {/* Image */}
            <div className="relative aspect-[4/3] bg-[#F4F0EB]">
              {listing.photo_url ? (
                <Image
                  src={listing.photo_url}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-4xl text-[#E5E0D8]">
                  📦
                </div>
              )}
              {listing.shipping_available && (
                <span className="absolute bottom-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  📦 Envío
                </span>
              )}
            </div>

            {/* Info */}
            <div className="p-3">
              <p className="text-base font-bold text-[#1C1917] mb-0.5">
                {fmtMXN(listing.price_mxn)}
                {listing.negotiable && (
                  <span className="text-xs font-normal text-[#6B7280] ml-1">· neg.</span>
                )}
              </p>
              <p className="text-xs text-[#374151] line-clamp-2 leading-snug mb-2">
                {listing.title}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded-full bg-[#1B4332] flex items-center justify-center text-[9px] text-white font-bold flex-shrink-0">
                    {listing.seller_name?.[0] ?? "V"}
                  </div>
                  <span className="text-[10px] text-[#6B7280] truncate max-w-[60px]">
                    {listing.seller_name}
                  </span>
                  <TrustBadge badge={listing.seller_badge} verified={listing.seller_verified} />
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
