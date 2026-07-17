"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingCard } from "@/lib/types";
import { WhatsAppBadgeLocked } from "@/components/WhatsAppCTA";
import { SellerVerificationBadges } from "@/components/SellerVerificationBadges";
import type { Lang } from "@/lib/i18n-lang";
import { isServicesListing } from "@/lib/listing-category";
import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { isPropertyManagementService } from "@/lib/property-management";

function fmtMXN(centavos: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}

type Props = {
  listings: ListingCard[];
  /** Must match `?lang=` on first paint; then synced from the URL on the client. */
  initialLang?: Lang;
};

export default function ListingGrid({ listings, initialLang = "es" }: Props) {
  const params = useSearchParams();
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    const p = (params.get("lang") || "es") as string;
    if (p === "en" || p === "es") setLang(p);
  }, [params]);

  if (!listings.length) {
    const emptyMsg = lang === "en" ? "No matching listings." : "No hay artículos que coincidan.";
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-[#6B7280] text-lg">{emptyMsg}</p>
      </div>
    );
  }

  const negotiableHint = lang === "en" ? "· negotiable" : "· negociable";
  const monthHint = lang === "en" ? "/mo" : "/mes";
  const consultHint = lang === "en" ? "Consultation required" : "Consulta requerida";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {listings.map((listing) => {
        const isPm = isPropertyManagementService(
          inferProviderSlugFromListingTitle(listing.title),
        );
        return (
        <Link
          key={listing.id}
          href={lang === "en" ? `/listing/${listing.id}?lang=en` : `/listing/${listing.id}`}
          className="group block"
        >
          <div className="bg-white rounded-2xl overflow-hidden border border-[#E5E0D8] hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
            <div className="relative aspect-[16/9] bg-[#F4F0EB]">
              {listing.photo_url ? (
                <Image
                  src={listing.photo_url}
                  alt={listing.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-4xl text-[#E5E0D8]">
                  {isPm ? "🏠" : "📦"}
                </div>
              )}
              {(listing.colonia_label || listing.location_city) && (
                <span className="absolute top-2 left-2 text-[10px] font-medium px-2 py-1 rounded-full bg-white/90 text-[#374151] backdrop-blur-sm">
                  📍 {listing.colonia_label ?? listing.location_city}
                </span>
              )}
              {isPm ? (
                <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-700/95 text-white backdrop-blur-sm">
                  {consultHint}
                </span>
              ) : isServicesListing({ category_id: listing.category_id }) ? (
                <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-1 rounded-full bg-[#1B4332]/92 text-white backdrop-blur-sm">
                  {lang === "en" ? "Paid via app" : "Pago en app"}
                </span>
              ) : null}
              {typeof listing.dist_km === "number" && Number.isFinite(listing.dist_km) && (
                <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded-full bg-[#1B4332]/90 text-white backdrop-blur-sm">
                  ~
                  {listing.dist_km % 1 === 0
                    ? String(listing.dist_km)
                    : listing.dist_km.toLocaleString(lang === "en" ? "en-US" : "es-MX", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                      })}{" "}
                  km
                  {lang === "en" ? " away" : ""}
                </span>
              )}
            </div>

            <div className="p-4">
              <p className="text-lg font-bold text-[#1B4332] mb-1">
                {isPm ? (
                  <>
                    <span className="text-xs font-semibold text-[#6B7280] mr-1">
                      {lang === "en" ? "From" : "Desde"}
                    </span>
                    {fmtMXN(listing.price_mxn)}
                    <span className="text-xs font-semibold text-[#6B7280] ml-1">
                      MXN{monthHint}
                    </span>
                  </>
                ) : (
                  <>
                    {fmtMXN(listing.price_mxn)}
                    <span className="text-xs font-semibold text-[#6B7280] ml-1">MXN</span>
                    {listing.negotiable && (
                      <span className="text-xs font-normal text-[#6B7280] ml-1">{negotiableHint}</span>
                    )}
                  </>
                )}
              </p>
              <p className="text-sm text-[#374151] line-clamp-2 leading-snug mb-3">{listing.title}</p>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-full bg-[#1B4332] flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
                    {listing.seller_name?.[0] ?? "V"}
                  </div>
                  <span className="text-xs text-[#6B7280] truncate max-w-[10rem]">
                    {listing.seller_name}
                  </span>
                  <SellerVerificationBadges
                    trustBadge={listing.seller_badge}
                    ineVerified={listing.seller_ine_verified}
                    rfcVerified={listing.seller_rfc_verified}
                    phoneVerified={listing.seller_phone_verified}
                    platformListingVerified={Boolean(listing.listing_admin_verified)}
                    lang={lang}
                    size="sm"
                  />
                </div>
                <div className="flex-shrink-0 self-center">
                  <WhatsAppBadgeLocked />
                </div>
              </div>
            </div>
          </div>
        </Link>
        );
      })}
    </div>
  );
}
