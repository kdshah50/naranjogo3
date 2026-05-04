import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import {
  allSuspectedDuplicateGroups,
  type DedupeListRow,
} from "@/lib/listing-duplicate-groups";

const DEFAULT_LIMIT = 400;

/**
 * GET ?pin=&limit=400
 * Returns heuristic duplicate groups (same seller + title/photo + price) for admin triage.
 */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
      { status: 503 },
    );
  }
  const pin = req.nextUrl.searchParams.get("pin")?.trim() ?? "";
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const limit = Math.min(800, Math.max(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT));

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select("id,seller_id,title_es,price_mxn,photo_urls,created_at,status,is_verified,category_id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/suspected-duplicates]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: DedupeListRow[] = (data ?? []).map((r) => ({
    id: String(r.id),
    seller_id: String(r.seller_id ?? ""),
    title_es: String(r.title_es ?? ""),
    price_mxn: Number(r.price_mxn) || 0,
    photo_urls: r.photo_urls,
    created_at: String(r.created_at ?? ""),
  }));

  const groups = allSuspectedDuplicateGroups(rows);

  return NextResponse.json({
    limit,
    scanned: rows.length,
    groupCount: groups.length,
    groups: groups.map((g) => ({
      reason: g.reason,
      key: g.key,
      listings: g.listings.map((l) => ({
        id: l.id,
        seller_id: l.seller_id,
        title_es: l.title_es,
        price_mxn: l.price_mxn,
        created_at: l.created_at,
        /** First photo only — keep payload small */
        photo_sample: Array.isArray(l.photo_urls) && typeof l.photo_urls[0] === "string" ? l.photo_urls[0] : null,
      })),
    })),
  });
}
