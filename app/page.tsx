import { Suspense } from "react";
import ListingBrowseSection from "@/components/listings/ListingBrowseSection";
import Hero from "@/components/Hero";
import CategoryBar from "@/components/CategoryBar";
import ServiceVerticalTabs from "@/components/ServiceVerticalTabs";
import TrustBar from "@/components/TrustBar";
import RetentionHomeBanner from "@/components/RetentionHomeBanner";
import { HomeListHeading } from "@/components/home/HomeListHeading";
import { COLONIAS, COLONIA_RADIUS_KM, nearestColonia, coloniaLabel } from "@/lib/colonias";
import { getPublicAppUrl } from "@/lib/app-url";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import {
  embeddedSellerRow,
  isSellerPhoneVerifiedForDisplay,
} from "@/lib/seller-trust-display";
import { normalizeBrowseCategory } from "@/lib/marketplace-categories";

export const dynamic = "force-dynamic";

const SMA_ZIP   = "37700";
const SMA_LAT   = 20.91528;
const SMA_LNG   = -100.74389;
const APP_URL = getPublicAppUrl();

function fmtMXN(c: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(c / 100);
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, d2r = Math.PI / 180;
  const a = Math.sin(((lat2-lat1)*d2r)/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(((lng2-lng1)*d2r)/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parsePricePesos(s: string | undefined): number | undefined {
  if (s == null || s === "") return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface Props {
  searchParams?: {
    q?: string;
    category?: string;
    lat?: string;
    lng?: string;
    lang?: string;
    colonia?: string;
    pmin?: string;
    pmax?: string;
  };
}

export default async function HomePage({ searchParams }: Props) {
  const categorySlug = normalizeBrowseCategory(searchParams?.category);
  const query       = searchParams?.q ?? "";
  const rawLang     = searchParams?.lang;
  const lang        = rawLang === "en" || rawLang === "es" ? rawLang : "es";
  const initialLang = lang;
  const coloniaKey  = searchParams?.colonia ?? "";
  const pminPesos   = parsePricePesos(searchParams?.pmin);
  const pmaxPesos   = parsePricePesos(searchParams?.pmax);
  let coloniaData   = coloniaKey ? COLONIAS[coloniaKey] : null;
  const userLat     = parseFloat(searchParams?.lat ?? "NaN");
  const userLng     = parseFloat(searchParams?.lng ?? "NaN");
  const hasGeo      = !isNaN(userLat) && !isNaN(userLng);
  const refLat      = hasGeo ? userLat : SMA_LAT;
  const refLng      = hasGeo ? userLng : SMA_LNG;

  let cards: any[] = [];
  let searchMode = "sparse";
  const supaHeaders = getServiceRoleRestHeaders();
  const supaUrl = getSupabaseUrl();

  try {
    if (query) {
      // ── Use hybrid search API when query present ──────────────────────────
      const params = new URLSearchParams({ q: query, category: categorySlug });
      if (hasGeo) { params.set("lat", String(userLat)); params.set("lng", String(userLng)); }
      if (coloniaKey) { params.set("colonia", coloniaKey); }
      if (pminPesos != null && pminPesos > 0) params.set("pmin", String(pminPesos));
      if (pmaxPesos != null && pmaxPesos > 0) params.set("pmax", String(pmaxPesos));
      const res = await fetch(`${APP_URL}/api/search?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        searchMode = data.mode ?? "sparse";
        const detectedColonia = data.colonia ?? null;
        cards = (data.results ?? []).map((row: any) => {
          const rLat = row.location_lat ?? SMA_LAT;
          const rLng = row.location_lng ?? SMA_LNG;
          const near = nearestColonia(rLat, rLng);
          const u = embeddedSellerRow(row.users) as {
            display_name?: string | null;
            trust_badge?: string | null;
            ine_verified?: boolean | null;
            rfc_verified?: boolean | null;
            phone_verified?: boolean | null;
          } | null;
          return {
            id: row.id, title: row.title_es, price_mxn: row.price_mxn,
            price_display: fmtMXN(row.price_mxn),
            category_id: row.category_id, condition: row.condition,
            location_city: row.location_city ?? "San Miguel de Allende",
            colonia_label: near?.label ?? null,
            photo_url: row.photo_urls?.[0] ?? null,
            location_lat: row.location_lat ?? null,
            location_lng: row.location_lng ?? null,
            shipping_available: row.shipping_available, negotiable: row.negotiable,
            seller_name: u?.display_name ?? "Proveedor",
            seller_badge: u?.trust_badge ?? "none",
            seller_ine_verified: Boolean(u?.ine_verified),
            seller_rfc_verified: Boolean(u?.rfc_verified),
            seller_phone_verified: isSellerPhoneVerifiedForDisplay(u),
            listing_admin_verified: Boolean(row.is_verified),
            payment_methods: row.payment_methods ?? null,
            dist_km: typeof row._dist_km === "number" ? row._dist_km : null,
          };
        });
        if (detectedColonia && !coloniaData) {
          coloniaData = COLONIAS[detectedColonia.key] ?? null;
        }
      }
    } else {
      // ── No query: show active verified listings for selected category ───────
      let browsePath =
        `/rest/v1/listings?status=eq.active&is_verified=eq.true&category_id=eq.${categorySlug}`
        + `&select=id,title_es,price_mxn,category_id,condition,location_city,location_lat,location_lng,shipping_available,negotiable,photo_urls,users!fk_listings_seller(display_name,trust_badge,ine_verified,rfc_verified,phone_verified)`
        + `&order=created_at.desc&limit=24`;
      if (pminPesos != null && pminPesos > 0) browsePath += `&price_mxn=gte.${pminPesos * 100}`;
      if (pmaxPesos != null && pmaxPesos > 0) browsePath += `&price_mxn=lte.${pmaxPesos * 100}`;
      const res = await fetch(`${supaUrl}${browsePath}`, { headers: supaHeaders, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        let rows = Array.isArray(data) ? data : [];

        if (coloniaData) {
          const cd = coloniaData;
          rows = rows.filter((row: any) => {
            const km = distKm(cd.lat, cd.lng, row.location_lat ?? SMA_LAT, row.location_lng ?? SMA_LNG);
            return km <= COLONIA_RADIUS_KM;
          });
        }

        cards = rows.map((row: any) => {
          const rLat = row.location_lat ?? SMA_LAT;
          const rLng = row.location_lng ?? SMA_LNG;
          const km = distKm(refLat, refLng, rLat, rLng);
          const near = nearestColonia(rLat, rLng);
          const u = embeddedSellerRow(row.users) as {
            display_name?: string | null;
            trust_badge?: string | null;
            ine_verified?: boolean | null;
            rfc_verified?: boolean | null;
            phone_verified?: boolean | null;
          } | null;
          return {
            id: row.id, title: row.title_es, price_mxn: row.price_mxn,
            price_display: fmtMXN(row.price_mxn),
            category_id: row.category_id, condition: row.condition,
            location_city: row.location_city ?? "San Miguel de Allende",
            colonia_label: near?.label ?? null,
            photo_url: row.photo_urls?.[0] ?? null,
            location_lat: row.location_lat ?? null,
            location_lng: row.location_lng ?? null,
            shipping_available: row.shipping_available, negotiable: row.negotiable,
            seller_name: u?.display_name ?? "Proveedor",
            seller_badge: u?.trust_badge ?? "none",
            seller_ine_verified: Boolean(u?.ine_verified),
            seller_rfc_verified: Boolean(u?.rfc_verified),
            seller_phone_verified: isSellerPhoneVerifiedForDisplay(u),
            listing_admin_verified: Boolean(row.is_verified),
            payment_methods: row.payment_methods ?? null,
            dist_km: Math.round(km * 10) / 10,
          };
        }).sort((a: any, b: any) => (a.dist_km ?? 0) - (b.dist_km ?? 0));
      }
    }
  } catch (e) { console.error("Search error:", e); }

  const isHybrid = searchMode === "hybrid";

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <Hero initialQuery={query} />
      <RetentionHomeBanner lang={initialLang} />
      <ServiceVerticalTabs />
      <CategoryBar />
      <section className="max-w-5xl mx-auto px-4 py-10">
        <Suspense
          fallback={
            <div className="h-32 mb-6 rounded-xl bg-[#F4F0EB] animate-pulse" aria-hidden />
          }
        >
          <HomeListHeading
            initialLang={initialLang}
            initialCategory={categorySlug}
            query={query}
            coloniaData={coloniaData}
            hasGeo={hasGeo}
            isHybrid={isHybrid}
            cardCount={cards.length}
          />
        </Suspense>
        <ListingBrowseSection
          listings={cards}
          initialLang={initialLang}
          mapCenterLat={refLat}
          mapCenterLng={refLng}
        />
      </section>
      <TrustBar />
    </main>
  );
}
