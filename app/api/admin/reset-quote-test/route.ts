import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { executeQuoteTestReset, previewQuoteTestReset } from "@/lib/admin-reset-quote-test";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";

export const dynamic = "force-dynamic";

type Body = {
  pin?: string;
  listingId?: string;
  buyerId?: string;
  dryRun?: boolean;
  clearMessages?: boolean;
  cancelOpenBookings?: boolean;
};

/**
 * GET ?pin=&listingId=&buyerId= — preview tailoring quote/chat reset counts.
 * POST { pin, listingId?, buyerId?, dryRun?, clearMessages?, cancelOpenBookings? }
 */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json({ error: "Admin no configurado: define ADMIN_PIN en el servidor" }, { status: 503 });
  }
  const pin = req.nextUrl.searchParams.get("pin")?.trim() ?? "";
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const listingId = req.nextUrl.searchParams.get("listingId")?.trim() || undefined;
  const buyerId = req.nextUrl.searchParams.get("buyerId")?.trim() || undefined;

  try {
    const supabase = createAdminSupabase();
    const preview = await previewQuoteTestReset(supabase, { listingId, buyerId });
    return NextResponse.json({ dryRun: true, ...preview });
  } catch (e) {
    console.error("[admin/reset-quote-test] GET", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json({ error: "Admin no configurado: define ADMIN_PIN en el servidor" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const pin = String(body.pin ?? "").trim();
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const listingId = String(body.listingId ?? "").trim() || undefined;
  const buyerId = String(body.buyerId ?? "").trim() || undefined;
  const dryRun = Boolean(body.dryRun);
  const clearMessages = body.clearMessages !== false;
  const cancelOpenBookings = body.cancelOpenBookings !== false;

  try {
    const supabase = createAdminSupabase();
    const opts = { listingId, buyerId, clearMessages, cancelOpenBookings };

    if (dryRun) {
      const preview = await previewQuoteTestReset(supabase, opts);
      return NextResponse.json({ dryRun: true, ...preview });
    }

    const before = await previewQuoteTestReset(supabase, opts);
    await executeQuoteTestReset(supabase, opts);
    const after = await previewQuoteTestReset(supabase, opts);
    return NextResponse.json({ ok: true, before, after });
  } catch (e) {
    console.error("[admin/reset-quote-test] POST", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error del servidor" }, { status: 500 });
  }
}
