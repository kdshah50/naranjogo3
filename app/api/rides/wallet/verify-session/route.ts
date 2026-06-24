import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { getStripe } from "@/lib/stripe";
import { isWalletEnabled } from "@/lib/wallet-flags";
import { getWalletForUser } from "@/lib/rides/wallet-server";
import { handleWalletTopupSessionCompleted } from "@/lib/rides/wallet-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const jsonNoStore = { "Cache-Control": "no-store, max-age=0" as const };

/**
 * GET ?session_id=cs_xxx
 *
 * After Stripe Checkout returns to /saldo, sync wallet credit if the webhook
 * has not run yet (wrong URL, signature mismatch, or delay).
 */
export async function GET(req: NextRequest) {
  if (!isWalletEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id")?.trim() ?? "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "session_id inválido" }, { status: 400 });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.purpose !== "wallet_topup") {
      return NextResponse.json({ error: "Sesión no es carga de saldo" }, { status: 404 });
    }

    const metaUserId = String(session.metadata?.user_id ?? "").trim();
    if (metaUserId && metaUserId.toLowerCase() !== userId.toLowerCase()) {
      return NextResponse.json({ error: "Sesión no corresponde a este usuario" }, { status: 403 });
    }

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          ok: false,
          paymentStatus: session.payment_status,
          message: "Pago aún no confirmado",
        },
        { status: 200, headers: jsonNoStore },
      );
    }

    const supabase = createAdminSupabase();
    const credit = await handleWalletTopupSessionCompleted(supabase, {
      eventType: "checkout.session.completed",
      session: {
        metadata: session.metadata as Record<string, string | undefined> | null,
        payment_intent: session.payment_intent,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        id: session.id,
      },
    });

    if (!credit.ok) {
      console.error("[rides/wallet/verify-session]", credit.error, { sessionId });
      return NextResponse.json({ error: credit.error }, { status: 500, headers: jsonNoStore });
    }

    const wallet = await getWalletForUser(supabase, userId, { ledgerLimit: 20 });

    return NextResponse.json(
      {
        ok: true,
        credited: credit.credited,
        reason: credit.reason,
        wallet,
      },
      { headers: jsonNoStore },
    );
  } catch (e) {
    console.error("[rides/wallet/verify-session] GET", e);
    return NextResponse.json({ error: "No se pudo verificar el pago" }, { status: 500 });
  }
}
