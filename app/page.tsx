import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Listing } from "@/lib/types";
import ListingGrid from "@/components/listings/ListingGrid";
import Hero from "@/components/Hero";
import CategoryBar from "@/components/CategoryBar";
import TrustBar from "@/components/TrustBar";

// Server Component — runs on the server, fetches listings from Supabase at request time
export default async function HomePage() {
  const supabase = createSupabaseServerClient();

  // Fetch active listings with seller info — SSR for fast initial load
  const { data: listings, error } = await supabase
    .from("listings")
    .select(`
      id, title_es, title_en, price_mxn, category_id, condition,
      location_city, location_state, shipping_available, negotiable,
      photo_urls, view_count, created_at, negotiable,
      users ( display_name, avatar_url, trust_badge, ine_verified )
    `)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.error("Failed to fetch listings:", error.message);
  }

  const featured = (listings as any[] || []).map((row) => ({
    id: row.id,
    title: row.title_es,
    price_mxn: row.price_mxn,
    category_id: row.category_id,
    condition: row.condition,
    location_city: row.location_city,
    photo_url: row.photo_urls?.[0] ?? null,
    shipping_available: row.shipping_available,
    negotiable: row.negotiable,
    seller_name: row.users?.display_name ?? "Vendedor",
    seller_badge: row.users?.trust_badge ?? "none",
    seller_verified: row.users?.ine_verified ?? false,
  }));

  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <Hero />
      <CategoryBar />
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            {featured.length > 0 ? "Destacados" : "Cargando artículos…"}
          </h2>
          <span className="text-sm text-[#6B7280]">
            {featured.length} artículos activos
          </span>
        </div>
        <ListingGrid listings={featured} />
      </section>
      <TrustBar />
    </main>
  );
}
