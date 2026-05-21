import type { SupabaseClient } from "@supabase/supabase-js";

/** Private bucket — store object keys only; serve via signed URLs. */
export const DRIVER_DOCS_BUCKET = "driver-docs";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;

export type DriverDocKind = "license" | "vehicle_card" | "insurance";

export async function uploadDriverDoc(
  supabase: SupabaseClient,
  userId: string,
  kind: DriverDocKind,
  file: File,
): Promise<{ ok: true; objectPath: string } | { ok: false; error: string }> {
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "Archivo demasiado grande (máx. 5 MB)" };
  }
  if (!ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
    return { ok: false, error: "Solo JPEG, PNG o WebP" };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `${userId}/${kind}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(DRIVER_DOCS_BUCKET)
    .upload(objectPath, buf, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[driver-storage] upload", kind, error);
    return {
      ok: false,
      error: "No se pudo subir el archivo — verifica que el bucket driver-docs exista en Supabase",
    };
  }

  return { ok: true, objectPath };
}

export async function signedDriverDocUrl(
  supabase: SupabaseClient,
  objectPath: string | null | undefined,
): Promise<string | null> {
  if (!objectPath) return null;
  if (objectPath.startsWith("http://") || objectPath.startsWith("https://")) {
    return objectPath;
  }
  const { data, error } = await supabase.storage
    .from(DRIVER_DOCS_BUCKET)
    .createSignedUrl(objectPath, 3600);
  if (error || !data?.signedUrl) {
    console.error("[driver-storage] signed url", error);
    return null;
  }
  return data.signedUrl;
}
