import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { signedInePhotoUrl } from "@/lib/ine-storage";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";

function phoneLookupVariants(phone: string | null | undefined): string[] {
  if (phone == null || !String(phone).trim()) return [];
  const raw = String(phone).trim();
  const digits = canonicalizeAuthPhone(normalizeAuthPhone(raw));
  const set = new Set<string>([raw, digits, `+${digits}`].filter(Boolean));
  return [...set];
}

/** Session + profile payload for /profile (bypasses RLS that blocks anon reads on users/listings). */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminSupabase();

    let user: any = null;
    let userError: any = null;

    const fullSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,ine_photo_url,stripe_connect_account_id,created_at";
    const fullNoRfcVerifiedSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,ine_photo_url,stripe_connect_account_id,created_at";
    const noRfcSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,ine_photo_url,stripe_connect_account_id,created_at";
    const noRfcNoRfcVerifiedSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,ine_photo_url,stripe_connect_account_id,created_at";
    const midRfcNoIneSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,created_at";
    const midRfcNoIneNoRfcVerifiedSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,created_at";
    const midNoIneSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,created_at";
    const midNoIneNoRfcVerifiedSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,created_at";
    const baseSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,created_at";
    const baseNoRfcVerifiedSelect =
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,created_at";
    const idVars = idMatchVariantsForIn(userId);

    const trySelect = async (cols: string) =>
      supabase.from("users").select(cols).in("id", idVars).maybeSingle();

    ({ data: user, error: userError } = await trySelect(fullSelect));
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(fullNoRfcVerifiedSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(noRfcSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(noRfcNoRfcVerifiedSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(midRfcNoIneSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(midRfcNoIneNoRfcVerifiedSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(midNoIneSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(midNoIneNoRfcVerifiedSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(baseSelect));
    }
    if (userError?.message?.includes("does not exist")) {
      ({ data: user, error: userError } = await trySelect(baseNoRfcVerifiedSelect));
    }

    if (userError) {
      console.error("[auth/me] user", userError);
      return NextResponse.json({ error: "No se pudo cargar el perfil" }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (user.ine_photo_url) {
      const signed = await signedInePhotoUrl(supabase, user.ine_photo_url as string);
      if (signed) user.ine_photo_url = signed;
    }

    /** All TEXT uuid variants that might appear as listings.seller_id for this account. */
    const sellerIdPool = new Set<string>();
    const addPool = (id: string | null | undefined) => {
      for (const v of idMatchVariantsForIn(String(id ?? ""))) sellerIdPool.add(v);
    };
    addPool(userId);
    addPool(user.id as string);
    const phoneVariants = phoneLookupVariants(user.phone as string | null);
    if (phoneVariants.length > 0) {
      const { data: samePhoneRows } = await supabase.from("users").select("id").in("phone", phoneVariants);
      for (const row of samePhoneRows ?? []) addPool(row.id);
    }
    const sellerIds = [...sellerIdPool].filter(Boolean);

    const { data: listings, error: listingsError } = await supabase
      .from("listings")
      .select("id,title_es,price_mxn,status,is_verified,category_id,location_city,created_at")
      .in("seller_id", sellerIds.length > 0 ? sellerIds : idMatchVariantsForIn(userId))
      .order("created_at", { ascending: false });

    if (listingsError) {
      console.error("[auth/me] listings", listingsError);
      return NextResponse.json({ user, listings: [] });
    }

    return NextResponse.json({ user, listings: listings ?? [] });
  } catch (e: any) {
    console.error("[auth/me] GET", e);
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const displayName = String(body?.display_name ?? "").trim();
    if (!displayName) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    let data: any = null;
    let error: any = null;
    const idVars = idMatchVariantsForIn(userId);

    const patchTry = (cols: string) =>
      supabase
        .from("users")
        .update({ display_name: displayName })
        .in("id", idVars)
        .select(cols)
        .maybeSingle();

    ({ data, error } = await patchTry(
      "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,ine_photo_url,stripe_connect_account_id,created_at",
    ));
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,ine_photo_url,stripe_connect_account_id,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,ine_photo_url,stripe_connect_account_id,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,ine_photo_url,stripe_connect_account_id,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,rfc,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,rfc,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,curp,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,curp,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,rfc_verified,created_at",
      ));
    }
    if (error?.message?.includes("does not exist")) {
      ({ data, error } = await patchTry(
        "id,phone,display_name,trust_badge,phone_verified,ine_verified,created_at",
      ));
    }

    if (error || !data) {
      console.error("[auth/me] PATCH", error);
      return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
    }

    if (data.ine_photo_url) {
      const signed = await signedInePhotoUrl(supabase, data.ine_photo_url as string);
      if (signed) data.ine_photo_url = signed;
    }

    return NextResponse.json({ user: data });
  } catch (e: any) {
    console.error("[auth/me] PATCH", e);
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
}
