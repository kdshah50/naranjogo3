import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { findOrCreateUserByPhone } from "@/lib/rides/driver-onboarding";
import {
  MAX_DRIVER_DOC_BYTES,
  uploadDriverDoc,
  type DriverDocKind,
} from "@/lib/rides/driver-storage";
import { formatApiErrorMessage } from "@/lib/rides/format-api-error";
import { isRidesEnabled } from "@/lib/rides/flags";

export const dynamic = "force-dynamic";

const KINDS = new Set<DriverDocKind>(["license", "vehicle_card", "insurance"]);

/**
 * POST /api/rides/drivers/upload-doc
 *
 * Upload one driver document at a time (max 2 MB) so three photos
 * don't exceed Vercel's total request body limit.
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const fd = await req.formData();
    const name = String(fd.get("name") ?? "").trim();
    const whatsapp = String(fd.get("whatsapp") ?? "").replace(/\s/g, "");
    const curp = String(fd.get("curp") ?? "").trim();
    const rfc = String(fd.get("rfc") ?? "").trim();
    const kindRaw = String(fd.get("kind") ?? "").trim();
    const file = fd.get("file");

    if (!name || !whatsapp) {
      return NextResponse.json({ error: "Nombre y WhatsApp son obligatorios" }, { status: 400 });
    }
    if (!KINDS.has(kindRaw as DriverDocKind)) {
      return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_DRIVER_DOC_BYTES) {
      return NextResponse.json(
        { error: `Archivo demasiado grande (máx. ${MAX_DRIVER_DOC_BYTES / 1024 / 1024} MB por foto)` },
        { status: 400 },
      );
    }

    const kind = kindRaw as DriverDocKind;
    const userResult = await findOrCreateUserByPhone({
      phone: whatsapp,
      displayName: name,
      curp: curp || undefined,
      rfc: rfc || undefined,
    });
    if (!userResult.ok) {
      return NextResponse.json(
        {
          error: formatApiErrorMessage(userResult.error, "No se pudo crear o encontrar el usuario"),
          details: userResult.error,
        },
        { status: 500 },
      );
    }

    const supabase = createAdminSupabase();
    const up = await uploadDriverDoc(supabase, userResult.userId, kind, file);
    if (!up.ok) {
      return NextResponse.json({ error: up.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      user_id: userResult.userId,
      kind,
      object_path: up.objectPath,
    });
  } catch (e: unknown) {
    console.error("[rides/drivers/upload-doc]", e);
    const msg = e instanceof Error ? e.message : "Error al subir el archivo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
