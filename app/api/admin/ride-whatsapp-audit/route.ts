import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { decryptRideWhatsAppAuditRow } from "@/lib/rides/ride-whatsapp-audit";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/**
 * GET /api/admin/ride-whatsapp-audit?pin=&since=&until=&ticket=&limit=
 * Decrypts ride WhatsApp notify log (body + phone) for compliance review.
 */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
      { status: 503 },
    );
  }

  const pin = req.nextUrl.searchParams.get("pin")?.trim() ?? "";
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const since = req.nextUrl.searchParams.get("since")?.trim() || null;
  const until = req.nextUrl.searchParams.get("until")?.trim() || null;
  const ticket = req.nextUrl.searchParams.get("ticket")?.trim().toUpperCase() || null;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const supabase = createAdminSupabase();
  let q = supabase
    .from("ride_whatsapp_notify_log")
    .select(
      "id,ride_id,ticket_code,phase,recipient_role,recipient_user_id,recipient_phone_enc,body_enc,twilio_ok,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  if (ticket) q = q.ilike("ticket_code", ticket);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/ride-whatsapp-audit]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row) =>
    decryptRideWhatsAppAuditRow(
      row as Parameters<typeof decryptRideWhatsAppAuditRow>[0],
    ),
  );

  return NextResponse.json({
    rows,
    count: rows.length,
    note: "body and recipient_phone decrypted with PII_ENCRYPTION_KEY (admin PIN only)",
  });
}
