import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { recordGuaranteeNoShowStrikeIfNeeded } from "@/lib/seller-strikes";

export const dynamic = "force-dynamic";

const VALID_REASONS = ["no_show", "poor_quality", "incomplete", "overcharged", "safety_issue", "other"] as const;

/**
 * GET /api/claims
 * - Buyer: returns their own claims
 * - Admin (?pin=…): returns all claims
 */
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get("pin");
  const statusFilter = req.nextUrl.searchParams.get("status") ?? "open";
  const supabase = createAdminSupabase();

  if (pin && isAdminPinConfigured() && pin === getAdminPin()) {
    let query = supabase
      .from("guarantee_claims")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const claims = await Promise.all(
      (data ?? []).map(async (c: Record<string, unknown>) => {
        const { data: booking } = await supabase
          .from("service_bookings")
          .select("commission_amount_cents,listing_id")
          .eq("id", c.booking_id)
          .maybeSingle();

        const { data: listing } = await supabase
          .from("listings")
          .select("title_es")
          .eq("id", c.listing_id)
          .maybeSingle();

        const { data: buyer } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", c.buyer_id)
          .maybeSingle();

        const { data: seller } = await supabase
          .from("users")
          .select("display_name")
          .eq("id", c.seller_id)
          .maybeSingle();

        return {
          ...c,
          listing_title: listing?.title_es ?? null,
          buyer_name: buyer?.display_name ?? "Comprador",
          seller_name: seller?.display_name ?? "Vendedor",
          commission_cents: booking?.commission_amount_cents ?? 0,
        };
      })
    );

    return NextResponse.json({ claims });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("guarantee_claims")
    .select("*")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claims: data ?? [] });
}

/**
 * POST /api/claims { bookingId, reason, details? }
 * Buyer submits a guarantee claim for a paid booking.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const bookingId = String((body as { bookingId?: string }).bookingId ?? "").trim();
  const reason = String((body as { reason?: string }).reason ?? "").trim();
  const details = String((body as { details?: string }).details ?? "").trim() || null;

  if (!bookingId) return NextResponse.json({ error: "bookingId requerido" }, { status: 400 });
  if (!VALID_REASONS.includes(reason as typeof VALID_REASONS[number])) {
    return NextResponse.json({ error: "Razón inválida" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,seller_id,listing_id,payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (booking.buyer_id !== userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (booking.payment_status !== "paid") {
    return NextResponse.json({ error: "Solo puedes reclamar reservas pagadas" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("guarantee_claims")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Ya existe un reclamo para esta reserva" }, { status: 409 });

  const { data: claim, error } = await supabase
    .from("guarantee_claims")
    .insert({
      booking_id: bookingId,
      buyer_id: userId,
      seller_id: booking.seller_id,
      listing_id: booking.listing_id,
      reason,
      details,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[claims] insert error", error);
    return NextResponse.json({ error: "No se pudo crear el reclamo" }, { status: 500 });
  }

  return NextResponse.json({ id: claim.id, message: "Reclamo creado" }, { status: 201 });
}

/**
 * PATCH /api/claims { pin, claimId, status, admin_note?, refund_amount_cents? }
 * Admin updates claim status.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const pin = String((body as { pin?: string }).pin ?? "").trim();
  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
      { status: 503 }
    );
  }
  if (!pin || pin !== getAdminPin()) return NextResponse.json({ error: "PIN inválido" }, { status: 401 });

  const claimId = String((body as { claimId?: string }).claimId ?? "").trim();
  const status = String((body as { status?: string }).status ?? "").trim();
  const adminNote = (body as { admin_note?: string }).admin_note ?? null;
  const refundCents = (body as { refund_amount_cents?: number }).refund_amount_cents ?? null;

  if (!claimId) return NextResponse.json({ error: "claimId requerido" }, { status: 400 });

  const validStatuses = ["under_review", "approved", "denied", "refunded"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  const { data: claimRow, error: fetchClaimErr } = await supabase
    .from("guarantee_claims")
    .select("id,booking_id,seller_id,reason,status")
    .eq("id", claimId)
    .maybeSingle();

  if (fetchClaimErr || !claimRow) {
    return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { status };
  if (adminNote) updates.admin_note = adminNote;
  if (refundCents !== null) updates.refund_amount_cents = refundCents;
  if (["approved", "denied", "refunded"].includes(status)) {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("guarantee_claims").update(updates).eq("id", claimId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const strike = await recordGuaranteeNoShowStrikeIfNeeded(supabase, {
      claimId,
      bookingId: String(claimRow.booking_id),
      sellerId: String(claimRow.seller_id),
      adminStatus: status,
      claimReason: String(claimRow.reason),
    });
    return NextResponse.json({ ok: true, strikeRecorded: strike.recorded });
  } catch (e) {
    console.error("[claims] PATCH strike hook failed (non-fatal)", e);
    return NextResponse.json({ ok: true });
  }
}
