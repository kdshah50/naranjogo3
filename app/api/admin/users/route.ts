import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { signedInePhotoUrl } from "@/lib/ine-storage";
import { normalizeCurpForStorage, normalizeRfcForStorage } from "@/lib/mx-tax-ids";

export const dynamic = "force-dynamic";

function adminNotConfigured() {
  return NextResponse.json(
    { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
    { status: 503 }
  );
}

/** GET ?pin=…  —  list all users (admin only). */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) return adminNotConfigured();
  const pin = req.nextUrl.searchParams.get("pin");
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  let data: any[] | null = null;
  let error: any = null;

    ({ data, error } = await supabase
      .from("users")
      .select(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,ine_photo_url,provider_rank_multiplier,created_at",
      )
      .order("created_at", { ascending: false }));

  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,ine_photo_url,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,ine_photo_url,created_at",
      )
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,ine_photo_url,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,created_at")
      .order("created_at", { ascending: false }));
  }
  if (error?.message?.includes("does not exist")) {
    ({ data, error } = await supabase
      .from("users")
      .select("id,phone,display_name,trust_badge,phone_verified,ine_verified,created_at")
      .order("created_at", { ascending: false }));
  }

  if (error) {
    console.error("[admin/users]", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }

  const rows = data ?? [];
  for (const u of rows) {
    if (u.ine_photo_url) {
      const signed = await signedInePhotoUrl(supabase, u.ine_photo_url as string);
      if (signed) u.ine_photo_url = signed;
    }
  }

  return NextResponse.json({ users: rows });
}

/** PATCH — update trust_badge / ine_verified for a user. */
export async function PATCH(req: NextRequest) {
  try {
    if (!isAdminPinConfigured()) return adminNotConfigured();
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    if (!pin || pin !== getAdminPin()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = String(body?.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const updates: Record<string, unknown> = {};

    if (body.trust_badge !== undefined) {
      const valid = ["none", "bronze", "gold", "diamond"];
      if (!valid.includes(body.trust_badge)) {
        return NextResponse.json({ error: `trust_badge must be one of: ${valid.join(", ")}` }, { status: 400 });
      }
      updates.trust_badge = body.trust_badge;
    }

    if (body.ine_verified !== undefined) {
      updates.ine_verified = Boolean(body.ine_verified);
    }

    if (body.rfc_verified !== undefined) {
      updates.rfc_verified = Boolean(body.rfc_verified);
    }

    if (body.provider_rank_multiplier !== undefined && body.provider_rank_multiplier !== null) {
      const m = Number(body.provider_rank_multiplier);
      if (!Number.isFinite(m) || m < 0.25 || m > 1.0) {
        return NextResponse.json(
          { error: "provider_rank_multiplier must be between 0.25 and 1.0" },
          { status: 400 },
        );
      }
      updates.provider_rank_multiplier = m;
    }

    if (body.display_name !== undefined) {
      updates.display_name = String(body.display_name).trim();
    }

    if (body.curp !== undefined) {
      const raw = body.curp === null || body.curp === "" ? "" : String(body.curp);
      updates.curp = raw ? normalizeCurpForStorage(raw) ?? null : null;
    }

    if (body.rfc !== undefined) {
      const raw = body.rfc === null || body.rfc === "" ? "" : String(body.rfc);
      updates.rfc = raw ? normalizeRfcForStorage(raw) ?? null : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    let data: {
      id: string;
      trust_badge: string | null;
      ine_verified: boolean | null;
      rfc_verified?: boolean | null;
      display_name: string | null;
    } | null = null;
    let error: { message: string } | null = null;

    ({ data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id,trust_badge,ine_verified,rfc_verified,display_name,provider_rank_multiplier")
      .maybeSingle());

    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .select("id,trust_badge,ine_verified,display_name,provider_rank_multiplier")
        .maybeSingle());
    }

    if (error) {
      console.error("[admin/users] PATCH", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: data });
  } catch (e: unknown) {
    console.error("[admin/users] PATCH", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
