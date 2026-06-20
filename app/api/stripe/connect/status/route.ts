import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";
import { fetchStripeConnectStatus } from "@/lib/stripe-connect-ready";

export const dynamic = "force-dynamic";

/** GET — current user's Connect status, or ?sellerId= for a buyer checking a booking provider. */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const sellerIdParam = req.nextUrl.searchParams.get("sellerId")?.trim() ?? "";
    const supabase = createAdminSupabase();
    let sellerId = userId;

    if (sellerIdParam) {
      const myPool = await expandUserAccountIdPool(supabase, userId);
      const sellerPool = await expandUserAccountIdPool(supabase, sellerIdParam);
      const isSelf = poolsOverlap(myPool, sellerPool);
      if (!isSelf) {
        const sellerVars = idMatchVariantsForIn(sellerIdParam);
        const { data: booking } = await supabase
          .from("service_bookings")
          .select("id,buyer_id,seller_id")
          .in("seller_id", sellerVars)
          .in("buyer_id", myPool)
          .eq("payment_status", "paid")
          .limit(1)
          .maybeSingle();
        if (!booking) {
          return NextResponse.json({ error: "No autorizado" }, { status: 403 });
        }
      }
      sellerId = sellerIdParam;
    }

    const accountId = await loadSellerConnectId(supabase, sellerId);
    if (!accountId) {
      return NextResponse.json({
        linked: false,
        accountId: null,
        payoutReady: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        transfersCapability: null,
        requirementsCurrentlyDue: [],
      });
    }

    const status = await fetchStripeConnectStatus(accountId);
    return NextResponse.json(status, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (e) {
    console.error("[stripe/connect/status] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
