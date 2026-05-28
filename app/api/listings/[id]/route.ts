import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, isSameUserId } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { hasServiceMenu, parseServiceMenu } from "@/lib/listing-service-menu";
import { embedListingInBackground } from "@/lib/listing-embedding";

const hJson = () => ({ ...getServiceRoleRestHeaders(), "Content-Type": "application/json" as const });

/** Keys owners must not set via PATCH (admin / system fields). */
const OWNER_MUTATION_BLOCKLIST = new Set([
  "seller_id",
  "is_verified",
  "commission_pct",
  "package_session_count",
  "package_total_price_mxn",
  "pin",
]);

function adminPinFromRequest(req: NextRequest, body: Record<string, unknown> | null): string {
  if (body && "pin" in body) {
    const p = String(body.pin ?? "").trim();
    if (p) return p;
  }
  const q = req.nextUrl.searchParams.get("pin")?.trim();
  if (q) return q;
  return req.headers.get("x-admin-pin")?.trim() ?? "";
}

type ListingAuth =
  | { ok: true; asAdmin: boolean }
  | { ok: false; res: NextResponse };

/**
 * Owner: JWT user matches listing.seller_id.
 * Admin: ADMIN_PIN is set and matches (body `pin`, query `pin`, or `x-admin-pin` header).
 */
function authorizeListingWrite(
  userId: string | null,
  listingSellerId: string,
  req: NextRequest,
  body: Record<string, unknown> | null
): ListingAuth {
  const isOwner = Boolean(userId && isSameUserId(userId, listingSellerId));
  if (isOwner) {
    return { ok: true, asAdmin: false };
  }
  if (isAdminPinConfigured()) {
    const pin = adminPinFromRequest(req, body);
    if (pin && pin === getAdminPin()) {
      return { ok: true, asAdmin: true };
    }
  }
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: "Inicia sesión" }, { status: 401 }) };
  }
  return { ok: false, res: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
}

function sanitizeOwnerPatchBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const k of OWNER_MUTATION_BLOCKLIST) {
    delete out[k];
  }
  return out;
}

function stripPinOnly(body: Record<string, unknown>): Record<string, unknown> {
  const { pin: _p, ...rest } = body;
  return rest;
}

async function getListingSellerId(listingId: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();
  if (error || !data?.seller_id) return null;
  const sid = data.seller_id;
  return typeof sid === "string" ? sid : null;
}

// GET /api/listings/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(
      `${getSupabaseUrl()}/rest/v1/listings?id=eq.${params.id}&select=*,users!fk_listings_seller(display_name,avatar_url,trust_badge,ine_verified,rfc_verified,created_at)`,
      { headers: hJson(), cache: "no-store" }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/listings/[id] — update listing (owner session, or admin PIN)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const listingId = params.id;
    const sellerId = await getListingSellerId(listingId);
    if (!sellerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const userId = await getUserIdFromRequest(req);
    const auth = authorizeListingWrite(userId, sellerId, req, body);
    if (!auth.ok) return auth.res;

    const payload = auth.asAdmin ? stripPinOnly(body) : sanitizeOwnerPatchBody(body);

    // Normalize / validate the service menu. Empty menu (no items) is stored as NULL
    // so the column reverts to "no menu published" state.
    if ("service_menu" in payload) {
      if (payload.service_menu === null) {
        payload.service_menu = null;
      } else {
        const parsed = parseServiceMenu(payload.service_menu);
        if (!parsed.ok) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        payload.service_menu = hasServiceMenu(parsed.menu) ? parsed.menu : null;
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
    }

    const res = await fetch(
      `${getSupabaseUrl()}/rest/v1/listings?id=eq.${listingId}`,
      {
        method: "PATCH",
        headers: { ...hJson(), Prefer: "return=representation" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });

    const updated = data[0];
    if (
      updated?.id &&
      (payload.title_es != null || payload.description_es != null || payload.description_en != null)
    ) {
      const supabase = createAdminSupabase();
      embedListingInBackground(supabase, listingId, {
        title_es: updated.title_es ?? payload.title_es,
        description_es: updated.description_es ?? payload.description_es,
        description_en: updated.description_en ?? payload.description_en,
      });
    }

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/listings/[id] — soft delete (archived); owner or admin PIN
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const listingId = params.id;
    const sellerId = await getListingSellerId(listingId);
    if (!sellerId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown> | null = null;
    try {
      const text = await req.text();
      if (text && text.trim()) {
        body = JSON.parse(text) as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const userId = await getUserIdFromRequest(req);
    const auth = authorizeListingWrite(userId, sellerId, req, body);
    if (!auth.ok) return auth.res;

    const res = await fetch(
      `${getSupabaseUrl()}/rest/v1/listings?id=eq.${listingId}`,
      {
        method: "PATCH",
        headers: { ...hJson(), Prefer: "return=representation" },
        body: JSON.stringify({ status: "archived" }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
