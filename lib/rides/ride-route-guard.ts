import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase, getTianguisJwtPayloadFromRequest, getUserIdFromRequest } from "@/lib/auth-server";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { isRidesEnabled } from "@/lib/rides/flags";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

/** JWT phone, or `users.phone` for legacy cookies missing `phone` claim. */
async function resolveAuthPhone(
  supabase: SupabaseClient,
  userId: string,
  payloadPhone: string | null,
): Promise<string | null> {
  if (payloadPhone) return payloadPhone;

  const idPool = idMatchVariantsForIn(userId);
  const { data: rows } = await supabase.from("users").select("phone").in("id", idPool);
  for (const row of rows ?? []) {
    const raw = String(row.phone ?? "").trim();
    if (!raw) continue;
    const digits = canonicalizeAuthPhone(normalizeAuthPhone(raw));
    if (digits) return digits;
  }
  return null;
}

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
  const supabase = createAdminSupabase();
  const payload = await getTianguisJwtPayloadFromRequest(req);
  const jwtPhone =
    typeof payload?.phone === "string" && payload.phone.trim().length > 0
      ? payload.phone.trim()
      : null;
  const authPhone = await resolveAuthPhone(supabase, userId, jwtPhone);
  return { ok: true, userId, authPhone, supabase };
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
