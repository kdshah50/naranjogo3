import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";

/** WhatsApp-ready E.164 digits for any linked login on this account (same WhatsApp, multiple user rows). */
export async function phoneDigitsForAccountPool(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string> {
  const pool = await expandUserAccountIdPool(supabase, accountId);
  const ids = [...new Set(pool.flatMap((id) => idMatchVariantsForIn(id)))];
  if (ids.length === 0) return "";

  const { data: rows } = await supabase.from("users").select("phone").in("id", ids);
  for (const row of rows ?? []) {
    const d = e164DigitsForWhatsAppRecipient(String(row.phone ?? ""));
    if (d) return d;
  }
  return "";
}
