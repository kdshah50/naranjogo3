import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ListingChat from "@/components/ListingChat";
import ServiceBookingBlock from "@/components/ServiceBookingBlock";
import WhatsAppCTA from "@/components/WhatsAppCTA";
import SellerReviews, { RatingSummary } from "@/components/SellerReviews";
import ReportButton from "@/components/ReportButton";
import GuaranteeBadge from "@/components/GuaranteeBadge";
import FavoriteButton from "@/components/FavoriteButton";
import AddToCartButton from "@/components/cart/AddToCartButton";
import { isServicesListing } from "@/lib/listing-category";
import { PAYMENT_METHODS_MX } from "@/lib/types";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { SellerVerificationBadges } from "@/components/SellerVerificationBadges";
import { embeddedSellerRow, verificationPropsFromSellerRow } from "@/lib/seller-trust-display";
import { langFromParam } from "@/lib/i18n-lang";
import ListingPhotoGallery from "@/components/ListingPhotoGallery";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supaUrl = getSupabaseUrl();
  const h = getServiceRoleRestHeaders();
  const res = await fetch(`${supaUrl}/rest/v1/listings?id=eq.${params.id}&select=title_es,description_es,photo_urls,price_mxn`, {
    headers: h,
    cache: "no-store",
  });
  const [data] = res.ok ? await res.json() : [];
  if (!data) return { title: "Artículo no encontrado - Naranjogo" };

  const price = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(data.price_mxn / 100);
  return {
    title: `${data.title_es} - ${price} | Naranjogo`,
    description: data.description_es?.slice(0, 160) ?? `${data.title_es} en venta en Naranjogo`,
    openGraph: {
      title: data.title_es,
      description: data.description_es ?? "",
      images: data.photo_urls?.[0] ? [{ url: data.photo_urls[0], width: 800, height: 600 }] : [],
    },
  };
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { chat?: string; lang?: string };
}) {
  const supaUrl = getSupabaseUrl();
  const h = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" };
  const res = await fetch(
    `${supaUrl}/rest/v1/listings?id=eq.${params.id}&status=eq.active&select=*,users!fk_listings_seller(id,display_name,avatar_url,trust_badge,ine_verified,rfc_verified,phone_verified,whatsapp_optin,created_at)`,
    { headers: h, cache: "no-store" }
  );
  const [listing] = res.ok ? await res.json() : [];
  if (!listing) notFound();

  fetch(`${supaUrl}/rest/v1/rpc/increment_view_count`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ listing_id: params.id }),
  }).catch(() => {});

  const seller = embeddedSellerRow(listing.users as Record<string, unknown> | Record<string, unknown>[] | null | undefined) as
    | {
        id?: string;
        display_name?: string | null;
        created_at?: string;
      }
    | null;
  const sellerId = listing.seller_id ?? seller?.id;

  let reviewCount = 0;
  let avgRating = 0;
  if (sellerId) {
    const revRes = await fetch(
      `${supaUrl}/rest/v1/seller_reviews?seller_id=eq.${sellerId}&select=rating`,
      { headers: h, cache: "no-store" }
    );
    const revRows: { rating: number }[] = revRes.ok ? await revRes.json() : [];
    reviewCount = revRows.length;
    avgRating =
      reviewCount > 0
        ? Math.round((revRows.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
        : 0;
  }

  const price = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(listing.price_mxn / 100);
  const isServiceListing = isServicesListing(listing);
  const listingLang = langFromParam(searchParams?.lang);
  const sellerTrust = verificationPropsFromSellerRow(
    listing.users as Parameters<typeof verificationPropsFromSellerRow>[0]
  );

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ListingPhotoGallery photos={Array.isArray(listing.photo_urls) ? listing.photo_urls : []} title={listing.title_es} />
        <div className="flex items-start justify-between mb-3">
          <span className="text-3xl font-bold text-[#1B4332]">
            {price}
            <span className="text-base font-semibold text-[#6B7280] ml-2">MXN</span>
          </span>
          {listing.negotiable && <span className="text-sm text-[#6B7280] italic">Negociable</span>}
        </div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold text-[#1C1917] flex-1 min-w-0">{listing.title_es}</h1>
          <FavoriteButton listingId={params.id} />
        </div>
        {isServiceListing && listing.package_session_count >= 2 && listing.package_total_price_mxn > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>Approved package:</strong> {listing.package_session_count} sessions for{" "}
            {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(
              listing.package_total_price_mxn / 100
            )}{" "}
            total (platform fee is calculated on this amount when you book).
          </div>
        )}
        <div className="flex flex-wrap gap-2 mb-6">
          {listing.shipping_available && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Envio disponible</span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#F4F0EB] text-[#6B7280]">{listing.condition}</span>
          {listing.location_city && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-[#F4F0EB] text-[#6B7280]">{listing.location_city}</span>
          )}
        </div>
        {isServiceListing &&
          typeof listing.availability_summary === "string" &&
          listing.availability_summary.trim().length > 0 && (
            <div className="mb-6 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3">
              <p className="text-xs font-semibold text-[#065F46] mb-1">
                {listingLang === "en" ? "Typical availability" : "Disponibilidad indicada"}
              </p>
              <p className="text-sm text-[#047857] whitespace-pre-line leading-relaxed">
                {listing.availability_summary.trim()}
              </p>
              <p className="text-[10px] text-[#059669] mt-2 leading-snug">
                {listingLang === "en"
                  ? "Exact time for your visit is agreed on WhatsApp after you connect."
                  : "La hora exacta del servicio se acuerda por WhatsApp al conectar con el proveedor."}
              </p>
            </div>
          )}
        {/* WhatsApp CTA — hero button (contact gate + commission same as services) */}
        <div className="mb-6">
          <WhatsAppCTA listingId={params.id} />
          <p className="text-center text-xs text-[#6B7280] mt-2">
            {isServiceListing
              ? "Platica primero, paga la tarifa y recibe el WhatsApp del proveedor"
              : "Escribe por la app, paga la tarifa de conexión y desbloquea el WhatsApp del vendedor"}
          </p>
        </div>

        {!isServiceListing && (
          <div className="mb-6 space-y-2">
            <AddToCartButton
              listingId={params.id}
              titleEs={listing.title_es}
              priceMxnCents={Number(listing.price_mxn) || 0}
            />
            <p className="text-xs text-[#6B7280] text-center">
              O compra por carrito: verás comisión (admin), IVA y total antes de pagar. Con Stripe Connect activo para
              vendedores, el subtotal va al vendedor; si no, el cargo es a la plataforma (reparto manual).
            </p>
          </div>
        )}

        {listing.description_es && <p className="text-[#374151] leading-relaxed mb-6">{listing.description_es}</p>}

        {/* Payment methods section — hidden until commission collection is enabled via Stripe */}

        {sellerId && (
          <Link href={`/seller/${sellerId}`} className="block hover:opacity-90 transition-opacity">
            <div className="bg-[#F4F0EB] rounded-xl p-4 mb-6 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {seller?.display_name?.[0] ?? "V"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-semibold text-sm">{seller?.display_name ?? "Vendedor"}</span>
                  <SellerVerificationBadges
                    trustBadge={sellerTrust.trustBadge}
                    ineVerified={sellerTrust.ineVerified}
                    rfcVerified={sellerTrust.rfcVerified}
                    phoneVerified={sellerTrust.phoneVerified}
                    platformListingVerified={Boolean(listing.is_verified)}
                    lang={listingLang}
                    size="md"
                  />
                  {reviewCount > 0 && <RatingSummary average={avgRating} total={reviewCount} />}
                </div>
                <span className="text-xs text-[#6B7280]">
                  Miembro desde{" "}
                  {seller?.created_at ? new Date(seller.created_at).getFullYear() : "—"}
                </span>
              </div>
            </div>
          </Link>
        )}
        <div className="flex flex-col gap-3">
          <ListingChat listingId={params.id} initialConversationId={searchParams?.chat} />
          <div id="booking-section">
            <ServiceBookingBlock
              listingId={params.id}
              isService={isServiceListing}
              sellerId={listing.seller_id ?? null}
              listingLang={listingLang}
            />
          </div>
        </div>

        <div className="mt-6">
          <GuaranteeBadge />
        </div>

        {sellerId && (
          <div className="mt-8">
            <h2 className="font-serif text-xl font-bold text-[#1C1917] mb-4">
              Reseñas del vendedor
              {reviewCount > 0 && <span className="ml-2 text-sm font-normal text-[#6B7280]">({reviewCount})</span>}
            </h2>
            <SellerReviews sellerId={sellerId} />
          </div>
        )}

        {/* Report */}
        <div className="mt-8 pt-6 border-t border-[#E5E0D8] flex justify-center">
          <ReportButton listingId={params.id} sellerId={sellerId} />
        </div>
      </div>
    </main>
  );
}
