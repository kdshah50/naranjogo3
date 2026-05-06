import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookings/:id — returns booking details + contact info if paid.
 * Only buyer or seller of the booking can access.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const { data: booking } = await supabase
      .from("service_bookings")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (booking.buyer_id !== userId && booking.seller_id !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("title_es,photo_urls,price_mxn")
      .eq("id", booking.listing_id)
      .maybeSingle();

    const { data: seller } = await supabase
      .from("users")
      .select("display_name,avatar_url,phone,whatsapp_optin")
      .eq("id", booking.seller_id)
      .maybeSingle();

    const isPaid = booking.payment_status === "paid";
    const phone = isPaid ? (booking.seller_phone_snapshot || seller?.phone) : null;
    const waDigits = phone?.replace(/\D/g, "") ?? "";
    const waUrl = isPaid && waDigits
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hola! Ya reservé tu servicio "${listing?.title_es ?? ""}" en Naranjogo.`)}`
      : null;

    return NextResponse.json({
      id: booking.id,
      listingId: booking.listing_id,
      paymentStatus: booking.payment_status,
      status: booking.status,
      commissionAmountCents: booking.commission_amount_cents,
      commissionPct: booking.commission_pct,
      paidAt: booking.paid_at,
      createdAt: booking.created_at,
      isBuyer: booking.buyer_id === userId,
      listing: listing ? {
        title: listing.title_es,
        photo: listing.photo_urls?.[0] ?? null,
        priceMxn: listing.price_mxn,
      } : null,
      seller: seller ? {
        displayName: seller.display_name,
        avatarUrl: seller.avatar_url,
      } : null,
      contact: isPaid ? { whatsappUrl: waUrl } : null,
    });
  } catch (e) {
    console.error("[bookings/:id] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
