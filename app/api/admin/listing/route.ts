import { NextRequest, NextResponse } from "next/server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";
import { createAdminSupabase } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!isAdminPinConfigured()) {
      return NextResponse.json(
        { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
        { status: 503 }
      );
    }
    const body = await req.json();
    const pin = String(body?.pin ?? "").trim();
    if (!pin || pin !== getAdminPin()) {
      return NextResponse.json({ error: "PIN incorrecto o no configurado en el servidor" }, { status: 401 });
    }

    const id = String(body?.id ?? "");
    const action = String(body?.action ?? "") as
      | "approve"
      | "reject"
      | "commission"
      | "package"
      | "calendar_sync";
    if (!id || !action) {
      return NextResponse.json({ error: "id y action requeridos" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminSupabase();
    } catch (e: any) {
      console.error("[admin/listing] supabase", e);
      return NextResponse.json(
        { error: "Servidor sin SUPABASE_SERVICE_ROLE_KEY o URL de Supabase" },
        { status: 500 }
      );
    }

    const parsePackageFields = (b: Record<string, unknown>) => {
      const psc = b?.package_session_count;
      const ptp = b?.package_total_price_mxn;
      const hasSess = psc != null && psc !== "" && psc !== undefined;
      const hasTot = ptp != null && ptp !== "" && ptp !== undefined;
      if (!hasSess && !hasTot) {
        return { package_session_count: null as number | null, package_total_price_mxn: null as number | null };
      }
      const n = typeof psc === "number" ? psc : parseInt(String(psc), 10);
      const total = typeof ptp === "number" ? ptp : parseInt(String(ptp), 10);
      if (!Number.isFinite(n) || n < 2 || !Number.isFinite(total) || total < 1) {
        return { error: "Package: 2+ sessions and total price in centavos, or leave both empty" };
      }
      return { package_session_count: Math.floor(n), package_total_price_mxn: Math.floor(total) };
    };

    if (action === "approve") {
      const raw = body?.commission_pct;
      const pct =
        typeof raw === "number" && !Number.isNaN(raw)
          ? raw
          : parseFloat(String(raw ?? "5"));
      const commission_pct = Number.isFinite(pct) ? Math.min(30, Math.max(0, pct)) : 5;

      const parsed = parsePackageFields(body);
      if ("error" in parsed) {
        return NextResponse.json({ error: (parsed as { error: string }).error }, { status: 400 });
      }
      const updateRow: Record<string, unknown> = {
        is_verified: true,
        commission_pct,
        package_session_count: parsed.package_session_count,
        package_total_price_mxn: parsed.package_total_price_mxn,
      };

      const { data, error } = await supabase
        .from("listings")
        .update(updateRow)
        .eq("id", id.trim())
        .select("id");

      if (error) {
        console.error("[admin/listing] approve", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data?.length) {
        return NextResponse.json(
          { error: "No se actualizó ningún anuncio (id no encontrado o distinto tipo en BD)" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "package") {
      const parsed = parsePackageFields(body);
      if ("error" in parsed) {
        return NextResponse.json({ error: (parsed as { error: string }).error }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("listings")
        .update({
          package_session_count: parsed.package_session_count,
          package_total_price_mxn: parsed.package_total_price_mxn,
        })
        .eq("id", id.trim())
        .select("id");

      if (error) {
        console.error("[admin/listing] package", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data?.length) {
        return NextResponse.json({ error: "No se encontró el anuncio" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      const { data, error } = await supabase
        .from("listings")
        .update({ status: "archived", is_verified: false })
        .eq("id", id.trim())
        .select("id");

      if (error) {
        console.error("[admin/listing] reject", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data?.length) {
        return NextResponse.json(
          { error: "No se actualizó ningún anuncio (id no encontrado)" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "calendar_sync") {
      const raw = body?.calendar_sync_enabled;
      if (typeof raw !== "boolean") {
        return NextResponse.json({ error: "calendar_sync_enabled debe ser true o false" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("listings")
        .update({ calendar_sync_enabled: raw })
        .eq("id", id.trim())
        .select("id");

      if (error) {
        console.error("[admin/listing] calendar_sync", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data?.length) {
        return NextResponse.json({ error: "No se encontró el anuncio" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "commission") {
      const raw = body?.commission_pct;
      const pct =
        typeof raw === "number" && !Number.isNaN(raw)
          ? raw
          : parseFloat(String(raw ?? "5"));
      const commission_pct = Number.isFinite(pct) ? Math.min(30, Math.max(0, pct)) : 5;

      const { data, error } = await supabase
        .from("listings")
        .update({ commission_pct })
        .eq("id", id.trim())
        .select("id");

      if (error) {
        console.error("[admin/listing] commission", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data?.length) {
        return NextResponse.json({ error: "No se encontró el anuncio" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  } catch (e: any) {
    console.error("[admin/listing] POST", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
