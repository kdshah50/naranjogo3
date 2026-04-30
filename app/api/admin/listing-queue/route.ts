import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";

/**
 * GET ?pin=&filter=pending|verified|all
 * Server-only listing queue for admin (replaces direct anon PostgREST after RLS).
 */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
      { status: 503 }
    );
  }
  const pin = req.nextUrl.searchParams.get("pin")?.trim() ?? "";
  const expected = getAdminPin();
  if (!expected || pin !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const filter = req.nextUrl.searchParams.get("filter") ?? "pending";
  const scope = req.nextUrl.searchParams.get("scope") ?? "services";
  const supabase = createAdminSupabase();

  let q = supabase
    .from("listings")
    .select(
      "id,title_es,description_es,price_mxn,category_id,is_verified,status,location_city,commission_pct,package_session_count,package_total_price_mxn,calendar_sync_enabled,calendar_last_synced_at,created_at,users!fk_listings_seller(display_name,phone)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (scope !== "all") {
    q = q.eq("category_id", "services");
  }

  if (filter === "pending") {
    q = q.eq("is_verified", false).eq("status", "active");
  } else if (filter === "verified") {
    q = q.eq("is_verified", true).eq("status", "active");
  } else {
    q = q.eq("status", "active");
  }

  const { data, error } = await q;
  if (error) {
    console.error("[admin/listing-queue]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listings: data ?? [] });
}
