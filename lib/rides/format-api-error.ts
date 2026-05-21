/** Turn Supabase / fetch error payloads into a user-visible Spanish message. */
export function formatApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    try {
      const s = JSON.stringify(error);
      if (s && s !== "{}" && s.length < 400) return s;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function formatDriverSignupClientError(
  status: number,
  data: unknown,
): string {
  if (status === 404) {
    return "Viajes no está activo en este sitio. Abre el enlace preview de la rama rides-setup.";
  }
  if (status === 413) {
    return `Las fotos son demasiado grandes. Usa imágenes de máximo 2 MB cada una.`;
  }
  if (status === 502 || status === 504) {
    return "El servidor tardó demasiado. Intenta con fotos más pequeñas.";
  }
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; details?: unknown };
    const base = formatApiErrorMessage(d.error, "");
    const detail = formatApiErrorMessage(d.details, "");
    if (base && detail && !base.includes(detail)) return `${base} — ${detail}`;
    if (base) return base;
    if (detail) return detail;
  }
  return `No se pudo enviar la solicitud (HTTP ${status}). Revisa que la migración Phase 1 esté aplicada en Supabase.`;
}
