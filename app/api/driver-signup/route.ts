import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { isRidesEnabled } from "@/lib/rides/flags";
import {
  buildDriverListingPayload,
  buildDriverProfileRow,
  findOrCreateUserByPhone,
  notifyAdminNewDriver,
  validateDriverSignup,
} from "@/lib/rides/driver-onboarding";
import { uploadDriverDoc, type DriverDocKind } from "@/lib/rides/driver-storage";
import { rateLimitListingCreateByUser } from "@/lib/rate-limit";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { COLONIAS } from "@/lib/colonias";

export const dynamic = "force-dynamic";

const DOC_FIELDS: Record<string, DriverDocKind> = {
  license_photo: "license",
  vehicle_card_photo: "vehicle_card",
  insurance_photo: "insurance",
};

/**
 * POST /api/driver-signup
 *
 * Driver onboarding (Phase 1). Accepts JSON or multipart/form-data (with photo files).
 * Gated by RIDES_ENABLED — returns 404 in production until launch.
 *
 * Does NOT modify /api/provider-signup.
 *
 * See: docs/RIDES_AI_PLAN.md §8.
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, unknown> = {};
    const pendingFiles = new Map<DriverDocKind, File>();

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      for (const [key, value] of fd.entries()) {
        if (value instanceof File && value.size > 0 && key in DOC_FIELDS) {
          pendingFiles.set(DOC_FIELDS[key], value);
          continue;
        }
        if (typeof value === "string") {
          if (key === "service_colonias") {
            try {
              body.service_colonias = JSON.parse(value);
            } catch {
              body.service_colonias = value.split(",").map((s) => s.trim()).filter(Boolean);
            }
          } else if (key === "accepted_terms" || key === "accepted_pricing") {
            body[key] = value === "true" || value === "1" || value === "on";
          } else {
            body[key] = value;
          }
        }
      }
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }

    const validated = validateDriverSignup(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const input = validated.data;
    const userResult = await findOrCreateUserByPhone({
      phone: input.whatsapp,
      displayName: input.name,
      curp: input.curp,
      rfc: input.rfc,
    });
    if (!userResult.ok) {
      return NextResponse.json({ error: userResult.error }, { status: 500 });
    }
    const userId = userResult.userId;

    const supabase = createAdminSupabase();

    if (pendingFiles.size > 0) {
      const urlKeys: Record<DriverDocKind, keyof typeof input> = {
        license: "license_photo_url",
        vehicle_card: "vehicle_card_photo_url",
        insurance: "insurance_photo_url",
      };
      for (const [kind, file] of pendingFiles) {
        const up = await uploadDriverDoc(supabase, userId, kind, file);
        if (!up.ok) {
          return NextResponse.json({ error: up.error }, { status: 400 });
        }
        input[urlKeys[kind] as keyof typeof input] = up.objectPath as never;
      }
    }

    const revalidated = validateDriverSignup({ ...body, ...input });
    if (!revalidated.ok) {
      return NextResponse.json({ error: revalidated.error }, { status: 400 });
    }

    const rl = await rateLimitListingCreateByUser(userId);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error:
            rl.reason === "hour"
              ? "Demasiados registros en poco tiempo. Intenta más tarde."
              : "Límite diario de anuncios alcanzado para este número. Contacta soporte.",
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const SUPA_URL = getSupabaseUrl();
    const h = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" as const };

    const existingProfile = await fetch(
      `${SUPA_URL}/rest/v1/driver_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id`,
      { headers: h },
    );
    const profiles = existingProfile.ok ? await existingProfile.json() : [];
    if (profiles.length > 0) {
      return NextResponse.json(
        { error: "Ya tienes un registro de conductor en revisión o activo." },
        { status: 409 },
      );
    }

    const profileRow = buildDriverProfileRow(revalidated.data, userId);
    const profileRes = await fetch(`${SUPA_URL}/rest/v1/driver_profiles`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify(profileRow),
    });
    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => ({}));
      console.error("[driver-signup] profile insert failed", err);
      return NextResponse.json(
        { error: "No se pudo guardar el perfil de conductor", details: err },
        { status: 500 },
      );
    }

    const listing = buildDriverListingPayload(revalidated.data, userId);
    const listingRes = await fetch(`${SUPA_URL}/rest/v1/listings`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify(listing),
    });
    if (!listingRes.ok) {
      let details: unknown;
      try {
        details = await listingRes.json();
      } catch {
        details = { message: await listingRes.text() };
      }
      console.error("[driver-signup] listing insert failed", details);
      await fetch(`${SUPA_URL}/rest/v1/driver_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: h,
      }).catch(() => {});
      const msg =
        details &&
        typeof details === "object" &&
        typeof (details as { message?: string }).message === "string"
          ? (details as { message: string }).message
          : "No se pudo crear el anuncio de conductor";
      return NextResponse.json({ error: msg, details }, { status: 500 });
    }

    const listingJson = await listingRes.json();
    const listingId = listingJson[0]?.id as string | undefined;

    const zonesEs = revalidated.data.service_colonias
      .map((k) => COLONIAS[k]?.label ?? k)
      .join(", ");
    notifyAdminNewDriver({
      name: revalidated.data.name,
      whatsapp: revalidated.data.whatsapp,
      vehicle: `${revalidated.data.vehicle_color} ${revalidated.data.vehicle_make} ${revalidated.data.vehicle_model} ${revalidated.data.vehicle_year}`,
      plates: revalidated.data.vehicle_plates,
      colonias: zonesEs,
      curp: revalidated.data.curp,
      rfc: revalidated.data.rfc,
      accepted_at: revalidated.data.accepted_at,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      user_id: userId,
      listing_id: listingId ?? null,
      pending_approval: true,
    });
  } catch (e: unknown) {
    console.error("[driver-signup]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
