import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getStripe } from "@/lib/stripe";
import { syncHousekeepingSupplementFromCheckoutSession } from "@/lib/housekeeping-balance-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?session_id=cs_xxx — sync balance/tip after Stripe redirect (webhook fallback). */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim() ?? "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "session_id inválido" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const supabase = createAdminSupabase();
    const result = await syncHousekeepingSupplementFromCheckoutSession(supabase, session);

    if (!result.kind) {
      return NextResponse.json({ error: "Sesión no es saldo ni propina" }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: result.ok || result.alreadyPaid,
        kind: result.kind,
        bookingId: result.bookingId ?? null,
        paymentStatus: session.payment_status,
        alreadyPaid: result.alreadyPaid ?? false,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    console.error("[verify-balance-session] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
