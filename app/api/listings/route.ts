import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { embedListingInBackground } from "@/lib/listing-embedding";
import { rateLimitListingCreateByUser } from "@/lib/rate-limit";

const PRICE_FLOORS: Record<string, number> = {
  electronics:  50000,
  vehicles:    500000,
  fashion:      10000,
  home:         10000,
  realestate: 1000000,
  sports:       10000,
  services:     10000,
  default:       5000,
};

export async function GET() {
  const h = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" };
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/listings?select=*,users!fk_listings_seller(display_name,trust_badge)&status=eq.active&is_verified=eq.true&order=created_at.desc&limit=24`,
    { headers: h }
  );
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "Inicia sesión para publicar" }, { status: 401 });
    }

    const rl = await rateLimitListingCreateByUser(userId);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error:
            rl.reason === "hour"
              ? "Demasiados anuncios en poco tiempo. Intenta de nuevo más tarde."
              : "Límite diario de publicaciones alcanzado. Contacta soporte si necesitas más.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const body = await req.json();

    const price_mxn = body.price_mxn ?? Math.round((parseFloat(body.price) || 0) * 100);
    const category  = body.category_id ?? body.category ?? "default";

    const floor = PRICE_FLOORS[category] ?? PRICE_FLOORS.default;

    if (price_mxn <= 0) {
      return NextResponse.json({ error: "El precio debe ser mayor a $0." }, { status: 400 });
    }
    if (price_mxn === 100) {
      return NextResponse.json({ error: "Precio inválido. El precio mínimo para esta categoría es mayor." }, { status: 400 });
    }
    if (price_mxn < floor) {
      return NextResponse.json(
        { error: `Precio muy bajo para esta categoría. Mínimo: $${Math.round(floor / 100).toLocaleString("es-MX")} MXN.` },
        { status: 400 }
      );
    }
    if (price_mxn > 500_000_000) {
      return NextResponse.json({ error: "Precio inválido. Verifica el monto." }, { status: 400 });
    }

    // Public browse/search only shows `is_verified=true`. Services stay pending until admin approves
    // (see provider-signup + /admin). Other categories publish immediately.
    const isVerified = category !== "services";

    // Always bind listing to the signed-in user — never trust client seller_id (old clients sent a demo uuid).
    const listing = {
      seller_id:          userId,
      title_es:           body.title_es ?? body.title ?? "Sin título",
      title_en:           body.title_es ?? body.title ?? "Untitled",
      description_es:     body.description_es ?? body.description ?? "",
      price_mxn,
      category_id:        category,
      condition:          body.condition ?? "good",
      status:             "active",
      is_verified:        isVerified,
      location_city:      body.location_city ?? body.city ?? "San Miguel de Allende",
      location_state:     body.location_state ?? "Guanajuato",
      zip_code:           body.zip_code ?? "37700",
      location_lat:       body.location_lat ?? 20.91528,
      location_lng:       body.location_lng ?? -100.74389,
      shipping_available: body.shipping_available ?? body.shipping ?? false,
      negotiable:         body.negotiable ?? false,
      photo_urls:         body.photo_urls ?? [],
      payment_methods:    Array.isArray(body.payment_methods) && body.payment_methods.length > 0
                            ? body.payment_methods
                            : ["efectivo", "whatsapp"],
      expires_at:         new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const h = getServiceRoleRestHeaders();
    const res = await fetch(`${getSupabaseUrl()}/rest/v1/listings`, {
      method: "POST",
      headers: {
        ...h,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(listing),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });

    const created = data[0];
    if (created?.id) {
      const supabase = createAdminSupabase();
      embedListingInBackground(supabase, created.id, {
        title_es: listing.title_es,
        description_es: listing.description_es,
      });

      const fastapiUrl = process.env.FASTAPI_INTERNAL_URL;
      if (fastapiUrl) {
        fetch(`${fastapiUrl}/fraud/score/${created.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "tianguis_secret_2026",
          },
          body: JSON.stringify({ price_mxn, category_id: category, seller_id: listing.seller_id }),
        }).catch(() => {});
      }
    }

    return NextResponse.json(created);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
