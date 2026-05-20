import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { expandUserAccountIdPool, poolsOverlap } from "@/lib/user-account-pool";
import { notifyBookingCancelledParty } from "@/lib/booking-cancel-notify";
import {
  canBuyerCancelBooking,
  canSellerCancelBooking,
  normalizeCancelNote,
  parseCancelReasonCode,
} from "@/lib/booking-cancellation";
import { notifyBuyerCompletedReviewPrompt } from "@/lib/buyer-completed-review-notify";
import { notifyBuyerLifecyclePhase, type BuyerPhaseWhatsAppResult } from "@/lib/buyer-phase-notify";
import { appendBookingEvent, BookingLifecycleStatus, canTransitionLifecycle } from "@/lib/booking-lifecycle";
import { appendListingChatBookingLifecycleNotice, type BookingChatLifecyclePhase } from "@/lib/listing-chat-booking-notices";
import { getPublicAppUrl } from "@/lib/app-url";
import { sellerCanManagePaidBookingRow } from "@/lib/seller-booking-access";

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
    const idVars = idMatchVariantsForIn(String(params.id ?? ""));
    if (idVars.length === 0) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    const { data: booking } = await supabase
      .from("service_bookings")
      .select("*")
      .in("id", idVars)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const buyerPoolBooking = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
    const sellerPoolBooking = await expandUserAccountIdPool(supabase, String(booking.seller_id));
    const isBuyer = poolsOverlap(myPool, buyerPoolBooking);
    const isSeller = poolsOverlap(myPool, sellerPoolBooking);
    if (!isBuyer && !isSeller) {
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
    const waUrl =
      isPaid && waDigits
        ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hola! Ya reservé tu servicio "${listing?.title_es ?? ""}" en Naranjogo.`)}`
        : null;

    const appUrl = getPublicAppUrl();

    return NextResponse.json({
      id: booking.id,
      listingId: booking.listing_id,
      ticketCode: booking.ticket_code ?? null,
      paymentStatus: booking.payment_status,
      status: booking.status,
      cancelledAt: booking.cancelled_at ?? null,
      cancelledByRole: booking.cancelled_by_role ?? null,
      cancelReasonCode: booking.cancel_reason_code ?? null,
      cancelNote: booking.cancel_note ?? null,
      commissionAmountCents: booking.commission_amount_cents,
      commissionPct: booking.commission_pct,
      paidAt: booking.paid_at,
      createdAt: booking.created_at,
      isBuyer,
      tracking: {
        buyerBookingsUrl: `${appUrl}/my-bookings`,
        sellerBookingsUrl: `${appUrl}/seller-bookings`,
        listingUrl: `${appUrl}/listing/${booking.listing_id}`,
        claimsUrl: `${appUrl}/claims?booking=${encodeURIComponent(booking.id)}`,
      },
      listing: listing
        ? {
            title: listing.title_es,
            photo: listing.photo_urls?.[0] ?? null,
            priceMxn: listing.price_mxn,
          }
        : null,
      seller: seller
        ? {
            displayName: seller.display_name,
            avatarUrl: seller.avatar_url,
          }
        : null,
      contact: isPaid ? { whatsappUrl: waUrl } : null,
    });
  } catch (e) {
    console.error("[bookings/:id] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * PATCH { status } — seller advances lifecycle, or buyer/seller cancels paid booking (audit + WhatsApp).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nextRaw = String(body?.status ?? "").toLowerCase();

    const bookingId = params.id?.trim();
    if (!bookingId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();

    if (nextRaw === "cancelled") {
      const cancelNote = normalizeCancelNote(body?.cancelNote ?? body?.cancel_note);
      const cancelAsRoleRaw = body?.cancelAsRole ?? body?.cancel_as_role;
      const cancelAsRole =
        cancelAsRoleRaw === "buyer" || cancelAsRoleRaw === "seller" ? cancelAsRoleRaw : null;

      const cancelIdVars = idMatchVariantsForIn(bookingId);
      if (cancelIdVars.length === 0) {
        return NextResponse.json({ error: "ID inválido" }, { status: 400 });
      }

      const { data: booking, error: fetchErr } = await supabase
        .from("service_bookings")
        .select("id,buyer_id,seller_id,listing_id,payment_status,status")
        .in("id", cancelIdVars)
        .maybeSingle();

      if (fetchErr || !booking) {
        return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
      }

      const rowId = String(booking.id);

      if (booking.payment_status !== "paid") {
        return NextResponse.json({ error: "Solo se pueden cancelar reservas pagadas" }, { status: 400 });
      }

      if (booking.status === "cancelled") {
        return NextResponse.json({ ok: true, unchanged: true, status: "cancelled" });
      }

      const myPool = await expandUserAccountIdPool(supabase, userId);
      const poolVariants = [...new Set(myPool.flatMap((id) => idMatchVariantsForIn(id)))];
      const buyerPoolBooking = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
      const isSeller = await sellerCanManagePaidBookingRow(supabase, poolVariants, booking);
      const isBuyer = poolsOverlap(myPool, buyerPoolBooking);

      if (!isSeller && !isBuyer) {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      }

      let role: "buyer" | "seller";
      if (isSeller && isBuyer) {
        if (!cancelAsRole) {
          return NextResponse.json(
            { error: "Indica cancelAsRole: buyer o seller (cuenta vinculada a ambas partes)." },
            { status: 400 }
          );
        }
        role = cancelAsRole;
      } else if (isSeller) {
        role = "seller";
      } else {
        role = "buyer";
      }

      if (role === "buyer" && !canBuyerCancelBooking(String(booking.status))) {
        return NextResponse.json(
          { error: "No puedes cancelar en este estado (contacta soporte o usa garantía si hubo incumplimiento)." },
          { status: 400 }
        );
      }
      if (role === "seller" && !canSellerCancelBooking(String(booking.status))) {
        return NextResponse.json({ error: "No puedes cancelar una reserva ya terminada." }, { status: 400 });
      }

      const reasonCode = parseCancelReasonCode(body?.cancelReasonCode ?? body?.cancel_reason_code, role);
      if (!reasonCode) {
        return NextResponse.json(
          {
            error:
              role === "buyer"
                ? "cancelReasonCode inválido (schedule_conflict, changed_mind, found_other_provider, other)."
                : "cancelReasonCode inválido (seller_unavailable, mutual_agreement, buyer_no_show, other).",
          },
          { status: 400 }
        );
      }

      if (!canTransitionLifecycle(booking.status, "cancelled")) {
        return NextResponse.json(
          { error: `No se puede cancelar desde el estado "${booking.status}".` },
          { status: 400 }
        );
      }

      const fromStatus = String(booking.status);
      const now = new Date().toISOString();
      const { data: updated, error: upErr } = await supabase
        .from("service_bookings")
        .update({
          status: "cancelled",
          cancelled_at: now,
          cancelled_by_role: role,
          cancel_reason_code: reasonCode,
          cancel_note: cancelNote,
          updated_at: now,
        })
        .eq("id", rowId)
        .eq("payment_status", "paid")
        .eq("status", fromStatus)
        .select("id,status")
        .maybeSingle();

      if (upErr || !updated) {
        return NextResponse.json(
          { error: "No se pudo cancelar (¿otro dispositivo cambió el estado?). Refresca e intenta." },
          { status: 409 }
        );
      }

      await appendBookingEvent(supabase, {
        bookingId: rowId,
        actorId: userId,
        eventType: "cancellation",
        fromStatus,
        toStatus: "cancelled",
        meta: { role, cancel_reason_code: reasonCode, cancel_note: cancelNote },
      });

      try {
        await notifyBookingCancelledParty(supabase, rowId, role, reasonCode);
      } catch (e) {
        console.error("[bookings/:id] PATCH cancel WhatsApp failed (non-fatal)", e);
      }

      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    const allowed: BookingLifecycleStatus[] = ["scheduled", "in_progress", "completed"];
    if (!allowed.includes(nextRaw as BookingLifecycleStatus)) {
      return NextResponse.json(
        { error: "status debe ser: scheduled, in_progress, completed o cancelled" },
        { status: 400 }
      );
    }
    const nextStatus = nextRaw as BookingLifecycleStatus;

    const lifeIdVars = idMatchVariantsForIn(bookingId);
    if (lifeIdVars.length === 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from("service_bookings")
      .select("id,buyer_id,seller_id,listing_id,payment_status,status,ticket_code")
      .in("id", lifeIdVars)
      .maybeSingle();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    const rowId = String(booking.id);

    const myPool = await expandUserAccountIdPool(supabase, userId);
    const poolVariants = [...new Set(myPool.flatMap((id) => idMatchVariantsForIn(id)))];
    if (!(await sellerCanManagePaidBookingRow(supabase, poolVariants, booking))) {
      return NextResponse.json(
        {
          error: "Solo el proveedor del anuncio puede actualizar el estado",
          code: "seller_not_listing_owner",
        },
        { status: 403 }
      );
    }

    if (booking.payment_status !== "paid") {
      return NextResponse.json({ error: "La reserva no está pagada" }, { status: 400 });
    }

    if (booking.status === "completed" && nextStatus === "completed") {
      let buyerPhaseWhatsApp: BuyerPhaseWhatsAppResult | undefined;
      try {
        buyerPhaseWhatsApp = await notifyBuyerCompletedReviewPrompt(supabase, rowId);
      } catch (e) {
        console.error("[bookings/:id] PATCH re-notify review prompt failed (non-fatal)", e);
        buyerPhaseWhatsApp = { delivered: false, reason: "send_failed" };
      }
      return NextResponse.json({ ok: true, alreadyCompleted: true, buyerPhaseWhatsApp });
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
      .eq("id", rowId)
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
      bookingId: rowId,
      actorId: userId,
      eventType: "lifecycle_transition",
      fromStatus,
      toStatus: nextStatus,
      meta: {},
    });

    try {
      await appendListingChatBookingLifecycleNotice(
        supabase,
        {
          id: String(booking.id),
          listing_id: String(booking.listing_id),
          buyer_id: String(booking.buyer_id),
          ticket_code: booking.ticket_code ?? null,
        },
        nextStatus as BookingChatLifecyclePhase
      );
    } catch (chatErr) {
      console.error("[bookings/:id] lifecycle in-app chat notice (non-fatal)", chatErr);
    }

    let buyerPhaseWhatsApp: BuyerPhaseWhatsAppResult | undefined;

    if (nextStatus === "scheduled" || nextStatus === "in_progress") {
      try {
        buyerPhaseWhatsApp = await notifyBuyerLifecyclePhase(supabase, rowId, nextStatus);
      } catch (e) {
        console.error("[bookings/:id] PATCH phase WhatsApp failed (non-fatal)", e);
        buyerPhaseWhatsApp = { delivered: false, reason: "send_failed" };
      }
    }

    if (nextStatus === "completed") {
      try {
        buyerPhaseWhatsApp = await notifyBuyerCompletedReviewPrompt(supabase, rowId);
      } catch (e) {
        console.error("[bookings/:id] PATCH review WhatsApp failed (non-fatal)", e);
        buyerPhaseWhatsApp = { delivered: false, reason: "send_failed" };
      }
    }

    return NextResponse.json({ ok: true, status: nextStatus, buyerPhaseWhatsApp });
  } catch (e) {
    console.error("[bookings/:id] PATCH", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
