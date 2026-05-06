import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { notifyBuyerCompletedReviewPrompt } from "@/lib/buyer-completed-review-notify";

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

/**
 * PATCH { status: "completed" } — seller marks a paid booking completed; buyer gets WhatsApp review link (once).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (String(body?.status ?? "").toLowerCase() !== "completed") {
      return NextResponse.json({ error: "Solo se admite status: completed" }, { status: 400 });
    }

    const bookingId = params.id?.trim();
    if (!bookingId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: booking, error: fetchErr } = await supabase
      .from("service_bookings")
      .select("id,buyer_id,seller_id,payment_status,status")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const sellerPoolBooking = await expandUserAccountIdPool(supabase, String(booking.seller_id));
    if (!poolsOverlap(myPool, sellerPoolBooking)) {
      return NextResponse.json({ error: "Solo el proveedor puede marcar completado" }, { status: 403 });
    }

    if (booking.payment_status !== "paid") {
      return NextResponse.json({ error: "La reserva no está pagada" }, { status: 400 });
    }

    if (booking.status === "completed") {
      try {
        await notifyBuyerCompletedReviewPrompt(supabase, bookingId);
      } catch (e) {
        console.error("[bookings/:id] PATCH re-notify review prompt failed (non-fatal)", e);
      }
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "Solo se puede completar una reserva confirmada (pagada)" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from("service_bookings")
      .update({ status: "completed", updated_at: now })
      .eq("id", bookingId)
      .eq("payment_status", "paid")
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();

    if (upErr || !updated) {
      return NextResponse.json({ error: "No se pudo actualizar la reserva" }, { status: 500 });
    }

    try {
      await notifyBuyerCompletedReviewPrompt(supabase, bookingId);
    } catch (e) {
      console.error("[bookings/:id] PATCH review WhatsApp failed (non-fatal)", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[bookings/:id] PATCH", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
