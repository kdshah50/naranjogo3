import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { notifyBuyerCompletedReviewPrompt } from "@/lib/buyer-completed-review-notify";
import { notifyBuyerLifecyclePhase } from "@/lib/buyer-phase-notify";
import { appendBookingEvent, BookingLifecycleStatus, canTransitionLifecycle } from "@/lib/booking-lifecycle";
import { getPublicAppUrl } from "@/lib/app-url";

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

    const appUrl = getPublicAppUrl();

    return NextResponse.json({
      id: booking.id,
      listingId: booking.listing_id,
      ticketCode: booking.ticket_code ?? null,
      paymentStatus: booking.payment_status,
      status: booking.status,
      commissionAmountCents: booking.commission_amount_cents,
      commissionPct: booking.commission_pct,
      paidAt: booking.paid_at,
      createdAt: booking.created_at,
      isBuyer: booking.buyer_id === userId,
      tracking: {
        buyerBookingsUrl: `${appUrl}/my-bookings`,
        sellerBookingsUrl: `${appUrl}/seller-bookings`,
        listingUrl: `${appUrl}/listing/${booking.listing_id}`,
        claimsUrl: `${appUrl}/claims?booking=${encodeURIComponent(booking.id)}`,
      },
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
 * PATCH { status: "scheduled" | "in_progress" | "completed" } — seller advances lifecycle (audit log + buyer WhatsApp on transitions).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nextRaw = String(body?.status ?? "").toLowerCase();
    const allowed: BookingLifecycleStatus[] = ["scheduled", "in_progress", "completed"];
    if (!allowed.includes(nextRaw as BookingLifecycleStatus)) {
      return NextResponse.json(
        { error: "status debe ser: scheduled, in_progress o completed" },
        { status: 400 }
      );
    }
    const nextStatus = nextRaw as BookingLifecycleStatus;

    const bookingId = params.id?.trim();
    if (!bookingId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: booking, error: fetchErr } = await supabase
      .from("service_bookings")
      .select("id,buyer_id,seller_id,payment_status,status,ticket_code")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const sellerPoolBooking = await expandUserAccountIdPool(supabase, String(booking.seller_id));
    if (!poolsOverlap(myPool, sellerPoolBooking)) {
      return NextResponse.json({ error: "Solo el proveedor puede actualizar el estado" }, { status: 403 });
    }

    if (booking.payment_status !== "paid") {
      return NextResponse.json({ error: "La reserva no está pagada" }, { status: 400 });
    }

    if (booking.status === "completed" && nextStatus === "completed") {
      try {
        await notifyBuyerCompletedReviewPrompt(supabase, bookingId);
      } catch (e) {
        console.error("[bookings/:id] PATCH re-notify review prompt failed (non-fatal)", e);
      }
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    if (booking.status === nextStatus) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    if (!canTransitionLifecycle(booking.status, nextStatus)) {
      return NextResponse.json(
        { error: `No se puede pasar de "${booking.status}" a "${nextStatus}"` },
        { status: 400 }
      );
    }

    const fromStatus = String(booking.status);
    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from("service_bookings")
      .update({ status: nextStatus, updated_at: now })
      .eq("id", bookingId)
      .eq("payment_status", "paid")
      .eq("status", fromStatus)
      .select("id,status")
      .maybeSingle();

    if (upErr || !updated) {
      return NextResponse.json(
        { error: "No se pudo actualizar (¿otro dispositivo cambió el estado?). Refresca e intenta de nuevo." },
        { status: 409 }
      );
    }

    await appendBookingEvent(supabase, {
      bookingId,
      actorId: userId,
      eventType: "lifecycle_transition",
      fromStatus,
      toStatus: nextStatus,
      meta: {},
    });

    if (nextStatus === "scheduled" || nextStatus === "in_progress") {
      try {
        await notifyBuyerLifecyclePhase(supabase, bookingId, nextStatus);
      } catch (e) {
        console.error("[bookings/:id] PATCH phase WhatsApp failed (non-fatal)", e);
      }
    }

    if (nextStatus === "completed") {
      try {
        await notifyBuyerCompletedReviewPrompt(supabase, bookingId);
      } catch (e) {
        console.error("[bookings/:id] PATCH review WhatsApp failed (non-fatal)", e);
      }
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e) {
    console.error("[bookings/:id] PATCH", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
