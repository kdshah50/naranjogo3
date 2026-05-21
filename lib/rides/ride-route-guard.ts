import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";

export async function ridesRouteGuard(
  req: NextRequest
): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createAdminSupabase> }
  | { ok: false; response: NextResponse }
> {
  if (!isRidesEnabled()) {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  return { ok: true, userId, supabase: createAdminSupabase() };
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
