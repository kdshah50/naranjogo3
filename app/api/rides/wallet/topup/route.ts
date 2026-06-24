import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth-server";
import { getPublicAppUrl } from "@/lib/app-url";
import { isWalletEnabled } from "@/lib/wallet-flags";
import { createWalletTopupCheckoutSession } from "@/lib/rides/wallet-oxxo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/rides/wallet/topup
 * Body: { amount_mxn: number }     // pesos, not centavos
 *
 * Creates a Stripe Checkout Session (OXXO + card) for wallet top-up and
 * returns the hosted-checkout URL. Wallet is credited later by the Stripe
 * webhook when payment confirms (Step 7).
 *
 * Gated by WALLET_ENABLED (or RIDES_ENABLED when unset).
 */
export async function POST(req: NextRequest) {
  if (!isWalletEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { amount_mxn?: unknown };
    const amountMxn = Number(body?.amount_mxn);
    if (!Number.isFinite(amountMxn) || amountMxn <= 0) {
      return NextResponse.json({ error: "Monto inválido (amount_mxn)" }, { status: 400 });
    }

    const amountMxnCents = Math.round(amountMxn * 100);

    const origin = req.headers.get("origin") ?? getPublicAppUrl();
    const result = await createWalletTopupCheckoutSession({
      userId,
      amountMxnCents,
      successUrl: `${origin}/saldo?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/saldo?topup=cancel`,
    });

    if (!result.ok) {
      const body: Record<string, unknown> = { error: result.error };
      if (result.detail) body.detail = result.detail;
      return NextResponse.json(body, { status: result.status });
    }

    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (e) {
    console.error("[rides/wallet/topup] POST", e);
    const err = e as { message?: string; code?: string; type?: string };
    const detail = [err?.type, err?.code, err?.message].filter(Boolean).join(" | ");
    return NextResponse.json(
      { error: "No se pudo iniciar la carga", detail: detail || String(e) },
      { status: 500 }
    );
  }
}
