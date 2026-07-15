import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { isWalletEnabled } from "@/lib/wallet-flags";
import { getWalletForUser } from "@/lib/rides/wallet-server";

/**
 * GET /api/rides/wallet
 *
 * Returns the authenticated user's Saldo Naranjo balance and recent ledger.
 * Gated by `WALLET_ENABLED` (or `RIDES_ENABLED` when unset).
 *
 * See: docs/RIDES_AI_PLAN.md §9 (Wallet + OXXO).
 */
export async function GET(req: NextRequest) {
  if (!isWalletEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const wallet = await getWalletForUser(supabase, userId, { ledgerLimit: 50 });

    const oxxoEnabled =
      String(process.env.WALLET_TOPUP_OXXO_ENABLED ?? "").trim().toLowerCase() === "true";

    return NextResponse.json({ wallet, topup: { oxxo: oxxoEnabled, card: true } });
  } catch (e) {
    console.error("[rides/wallet] GET", e);
    return NextResponse.json({ error: "No se pudo cargar el saldo" }, { status: 500 });
  }
}
