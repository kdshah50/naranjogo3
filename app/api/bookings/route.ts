import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookings?status=paid
 * GET /api/bookings?seller=1&status=paid — authenticated seller's paid bookings (mark complete UI).
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const statusFilter = req.nextUrl.searchParams.get("status");
  const sellerMode = req.nextUrl.searchParams.get("seller") === "1" || req.nextUrl.searchParams.get("seller") === "true";

  const supabase = createAdminSupabase();

  let query = supabase
    .from("service_bookings")
    .select("id,listing_id,seller_id,buyer_id,commission_amount_cents,payment_status,paid_at,status,created_at,package_session_count")
    .order("created_at", { ascending: false })
    .limit(50);

  if (sellerMode) {
    const pool = await expandUserAccountIdPool(supabase, userId);
    query = query.in("seller_id", pool);
  } else {
    query = query.eq("buyer_id", userId);
  }

  if (statusFilter === "paid") {
    query = query.eq("payment_status", "paid");
  }

  const { data: bookings, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookingRows = bookings ?? [];
  const bookingIds = bookingRows.map((b: { id: string }) => b.id);
  const reviewedSet = new Set<string>();
  if (bookingIds.length > 0) {
    const { data: revRows } = await supabase
      .from("seller_reviews")
      .select("booking_id")
      .in("booking_id", bookingIds);
    for (const r of revRows ?? []) {
      if (r.booking_id) reviewedSet.add(r.booking_id);
    }
  }

  const enriched = await Promise.all(
    bookingRows.map(async (b: Record<string, unknown>) => {
      const { data: listing } = await supabase
        .from("listings")
        .select("title_es")
        .eq("id", b.listing_id)
        .maybeSingle();

      let buyer_name = "Comprador";
      let seller_name = "Proveedor";
      if (sellerMode) {
        const { data: buyer } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", b.buyer_id)
          .maybeSingle();
        buyer_name = buyer?.display_name?.trim() || "Comprador";
      } else {
        const { data: seller } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", b.seller_id)
          .maybeSingle();
        seller_name = seller?.display_name?.trim() || "Proveedor";
      }

      return {
        ...b,
        has_review: reviewedSet.has(String(b.id)),
        listing_title: listing?.title_es ?? "Servicio",
        ...(sellerMode ? { buyer_name } : { seller_name }),
      };
    })
  );

  return NextResponse.json({ bookings: enriched });
}
