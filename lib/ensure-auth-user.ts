import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidAuthPhone, storageAuthPhone } from "@/lib/phone";
import {
  canonicalizeDuplicateUserPhones,
  pickLoginUserForPhone,
  type LoginUserRow,
} from "@/lib/resolve-login-user";

export type EnsureAuthUserResult =
  | { ok: true; user: LoginUserRow; created: boolean }
  | { ok: false; error: string };

/**
 * OTP login / signup: one row per phone. Reuses existing account; never creates a second UUID.
 */
export async function ensureAuthUserForPhone(
  supabase: SupabaseClient,
  rawPhone: string,
  opts?: {
    referredBy?: string | null;
    trustBadge?: string;
  },
): Promise<EnsureAuthUserResult> {
  const phone = storageAuthPhone(rawPhone);
  if (!isValidAuthPhone(phone)) {
    return { ok: false, error: "Teléfono inválido" };
  }

  await canonicalizeDuplicateUserPhones(supabase, phone);

  const existing = await pickLoginUserForPhone(supabase, phone);
  if (existing) {
    const { error: upErr } = await supabase
      .from("users")
      .update({ phone, phone_verified: true })
      .eq("id", existing.id);
    if (upErr) return { ok: false, error: "No se pudo actualizar usuario" };
    return { ok: true, user: { ...existing, phone_verified: true, phone }, created: false };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("users")
    .insert({
      phone,
      phone_verified: true,
      trust_badge: opts?.trustBadge ?? "bronze",
      referred_by: opts?.referredBy ?? null,
    })
    .select("id, display_name, trust_badge, phone_verified, phone, created_at")
    .single();

  if (insErr) {
    // Race: another request inserted — reuse winner.
    if (insErr.code === "23505") {
      await canonicalizeDuplicateUserPhones(supabase, phone);
      const again = await pickLoginUserForPhone(supabase, phone);
      if (again) {
        return { ok: true, user: again, created: false };
      }
    }
    console.error("[ensure-auth-user] insert", insErr);
    return { ok: false, error: "No se pudo crear usuario" };
  }

  if (!inserted) return { ok: false, error: "No se pudo crear usuario" };
  return { ok: true, user: inserted as LoginUserRow, created: true };
}
