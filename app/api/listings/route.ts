import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { analyzeListingPhoto, scoreFraud } from "@/lib/fastapi-client";
import { CreateListingInput } from "@/lib/types";

// GET /api/listings — paginated active listings (used by client components)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const query    = searchParams.get("q");
  const city     = searchParams.get("city");
  const page     = parseInt(searchParams.get("page") || "1");
  const limit    = 24;
  const offset   = (page - 1) * limit;

  const supabase = createSupabaseServerClient();

  let builder = supabase
    .from("listings")
    .select(`
      id, title_es, price_mxn, category_id, condition,
      location_city, shipping_available, negotiable,
      photo_urls, created_at,
      users ( display_name, trust_badge, ine_verified )
    `, { count: "exact" })
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== "all") builder = builder.eq("category_id", category);
  if (city)     builder = builder.eq("location_city", city);
  if (query)    builder = builder.ilike("title_es", `%${query}%`);

  const { data, error, count } = await builder;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ listings: data, total: count, page, limit });
}

// POST /api/listings — create new listing, trigger ML + fraud scoring
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();

  // Verify auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CreateListingInput = await req.json();

  // Validate required fields
  if (!body.title_es || !body.price_mxn || !body.category_id) {
    return NextResponse.json({ error: "title_es, price_mxn, category_id required" }, { status: 400 });
  }

  // Ensure seller user record exists
  await supabase.from("users").upsert({
    id:           user.id,
    phone:        user.phone ?? `+52${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
    display_name: user.user_metadata?.display_name ?? "Vendedor",
  }, { onConflict: "id" });

  // Insert listing as draft first
  const { data: listing, error: insertErr } = await supabase
    .from("listings")
    .insert({
      seller_id:          user.id,
      title_es:           body.title_es,
      title_en:           body.title_en ?? null,
      description_es:     body.description_es ?? "",
      price_mxn:          body.price_mxn,   // expects centavos
      category_id:        body.category_id,
      condition:          body.condition ?? "good",
      status:             "draft",           // goes active after ML passes
      location_city:      body.location_city,
      location_state:     body.location_state,
      shipping_available: body.shipping_available ?? false,
      negotiable:         body.negotiable ?? false,
      photo_urls:         body.photo_urls ?? [],
    })
    .select("id")
    .single();

  if (insertErr || !listing) {
    return NextResponse.json({ error: insertErr?.message }, { status: 500 });
  }

  // Fire-and-forget: trigger ML analysis + fraud scoring via FastAPI
  if (body.photo_urls?.[0]) {
    analyzeListingPhoto(listing.id, body.photo_urls[0]).then(async (mlResult: any) => {
      await supabase.from("listings").update({
        status:                "active",
        ai_category_confidence: mlResult?.confidence ?? null,
        suggested_price_mxn:   mlResult?.suggested_price_mxn ?? null,
      }).eq("id", listing.id);
    }).catch((err: Error) => {
      // ML failed — still activate listing
      supabase.from("listings").update({ status: "active" }).eq("id", listing.id);
      console.warn("ML analysis failed:", err.message);
    });

    scoreFraud(listing.id).catch((err: Error) =>
      console.warn("Fraud scoring failed:", err.message)
    );
  } else {
    // No photo — activate immediately
    await supabase.from("listings").update({ status: "active" }).eq("id", listing.id);
  }

  return NextResponse.json({ id: listing.id }, { status: 201 });
}
