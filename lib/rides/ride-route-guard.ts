import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getTianguisJwtPayloadFromRequest, getUserIdFromRequest } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";

export async function ridesRouteGuard(
  req: NextRequest
): Promise<
  | {
      ok: true;
      userId: string;
      authPhone: string | null;
      supabase: ReturnType<typeof createAdminSupabase>;
    }
  | { ok: false; response: NextResponse }
> {
  if (!isRidesEnabled()) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const payload = await getTianguisJwtPayloadFromRequest(req);
  const authPhone =
    typeof payload?.phone === "string" && payload.phone.trim().length > 0
      ? payload.phone.trim()
      : null;
  return { ok: true, userId, authPhone, supabase: createAdminSupabase() };
}

export function tripErrorResponse(result: { error: string; code?: string }) {
  const status =
    result.code === "forbidden"
      ? 403
      : result.code === "invalid_state" || result.code === "invalid_ticket"
        ? 409
        : result.code === "insufficient_balance"
          ? 402
          : 400;
  return NextResponse.json({ error: result.error, code: result.code }, { status });
}
