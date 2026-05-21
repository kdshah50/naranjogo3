import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import { signedDriverDocUrl } from "@/lib/rides/driver-storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/rides/drivers/me
 *
 * Returns the authenticated user's driver profile + pending/active status.
 */
export async function GET(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(userId);

    const { data: profile, error: pErr } = await supabase
      .from("driver_profiles")
      .select("*")
      .in("user_id", idVars)
      .maybeSingle();

    if (pErr) {
      console.error("[rides/drivers/me] profile", pErr);
      return NextResponse.json({ error: "No se pudo cargar el perfil" }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ driver: null });
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("id,title_es,status,is_verified,subcategory_kind")
      .in("seller_id", idVars)
      .eq("subcategory_kind", "ride")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [licenseUrl, vehicleCardUrl, insuranceUrl] = await Promise.all([
      signedDriverDocUrl(supabase, profile.license_photo_url as string),
      signedDriverDocUrl(supabase, profile.vehicle_card_photo_url as string),
      signedDriverDocUrl(supabase, profile.insurance_photo_url as string),
    ]);

    return NextResponse.json({
      driver: {
        ...profile,
        license_photo_url: licenseUrl ?? profile.license_photo_url,
        vehicle_card_photo_url: vehicleCardUrl ?? profile.vehicle_card_photo_url,
        insurance_photo_url: insuranceUrl ?? profile.insurance_photo_url,
        listing,
        can_receive_rides: Boolean(profile.is_active_driver && listing?.is_verified),
      },
    });
  } catch (e) {
    console.error("[rides/drivers/me] GET", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
