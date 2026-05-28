import { NextRequest, NextResponse } from "next/server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { createAdminSupabase } from "@/lib/auth-server";
import { embedAndStoreListing } from "@/lib/listing-embedding";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Admin: vectorize listings missing `embedding` (enables dense hybrid search). */
export async function POST(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json({ error: "ADMIN_PIN not configured" }, { status: 503 });
  }

  let body: { pin?: string; limit?: number; verified_only?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const pin = String(body.pin ?? "").trim();
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set on server" }, { status: 503 });
  }

  const limit = Math.min(50, Math.max(1, Number(body.limit) || 20));
  const verifiedOnly = body.verified_only !== false;

  const supabase = createAdminSupabase();
  let q = supabase
    .from("listings")
    .select("id,title_es,description_es,description_en,status,is_verified,embedding")
    .eq("status", "active")
    .is("embedding", null)
    .limit(limit);
  if (verifiedOnly) q = q.eq("is_verified", true);

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const row of rows ?? []) {
    const r = await embedAndStoreListing(supabase, row.id, row);
    results.push({ id: row.id, ok: r.ok, error: r.error });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({
    processed: results.length,
    ok,
    failed: results.length - ok,
    results,
  });
}
