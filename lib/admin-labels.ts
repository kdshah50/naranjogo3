import type { Lang } from "@/lib/i18n-lang";

/** Bilingual UI strings for `app/admin/page.tsx` (operator-facing). */
export function adminLabels(lang: Lang) {
  const es = lang === "es";
  return {
    pinTitle: es ? "Admin — Naranjogo" : "Admin — Naranjogo",
    hide: es ? "Ocultar" : "Hide",
    show: es ? "Mostrar" : "Show",
    wrongPin: es ? "PIN incorrecto" : "Incorrect PIN",
    enter: "Enter",
    noVerifyService:
      es
        ? "No está el servicio de verificación. Haz redeploy en Vercel con el código nuevo."
        : "Verification service is not available. Redeploy on Vercel with the new code.",
    pinWrongDetail:
      es ? "PIN incorrecto (revisa ADMIN_PIN en el servidor)." : "Incorrect PIN (check ADMIN_PIN on the server).",
    errorWithStatus: (status: number) =>
      es ? `Error ${status}. Revisa logs en Vercel.` : `Error ${status}. Check logs in Vercel.`,
    noConnection: es ? "Sin conexión o error de red." : "No connection or network error.",
    headerTitle: "Naranjogo Admin",
    headerSub: es ? "Aprobación de proveedores, verificación y confianza" : "Provider approval, verification & trust",
    backSite: es ? "← Volver al sitio" : "← Back to site",
    leavePanel: es ? "Salir del panel" : "Leave panel",
    logout: es ? "Cerrar sesión" : "Log out",
    tabListings: es ? "📋 Anuncios" : "📋 Listings",
    tabSellers: es ? "👤 Vendedores y confianza" : "👤 Sellers & Trust",
    tabReports: es ? "🚩 Reportes" : "🚩 Reports",
    tabClaims: es ? "🛡️ Reclamos" : "🛡️ Claims",
    filterPending: es ? "⏳ Pendientes" : "⏳ Pending approval",
    filterVerified: es ? "✅ Verificados" : "✅ Verified",
    filterAll: es ? "📋 Todos" : "📋 All",
    dupTitle: es ? "Posibles duplicados (heurística)" : "Possible duplicates (heuristic)",
    dupSub:
      es
        ? "Mismo vendedor + título normalizado + precio, o misma foto + precio. Buscar no modifica datos."
        : "Same seller + normalized title + price, or same photo + price. Search does not change data.",
    dupAnalyze: es ? "Analizando…" : "Analyzing…",
    dupLoad: es ? "Cargar análisis" : "Load analysis",
    dupScanned: es ? "Escaneados" : "Scanned",
    dupGroups: es ? "Grupos" : "Groups",
    dupReasonTitlePrice: es ? "Título + precio" : "Title + price",
    dupReasonPhotoPrice: es ? "Foto + precio" : "Photo + price",
    dupListings: es ? "anuncios" : "listings",
    dupNoGroups:
      es
        ? "Sin grupos bajo esta heurística (o sube el límite en API)."
        : "No groups under this heuristic (or raise the limit in the API).",
    loading: es ? "Cargando…" : "Loading...",
    loadingSellers: es ? "Cargando vendedores…" : "Loading sellers...",
    loadingReports: es ? "Cargando reportes…" : "Loading reports...",
    loadingClaims: es ? "Cargando reclamos…" : "Loading claims...",
    noUsers: es ? "No se encontraron usuarios" : "No users found",
    noName: es ? "Sin nombre" : "No name",
    joined: es ? "Registro" : "Joined",
    viewIne: es ? "📸 Ver foto INE →" : "📸 View INE photo →",
    noDocs: es ? "Sin documentos de verificación" : "No verification documents",
    review: (n: number) =>
      es
        ? `★ … · ${n} reseña${n !== 1 ? "s" : ""}`
        : `★ … · ${n} review${n !== 1 ? "s" : ""}`,
    moreForGold: (n: number) =>
      es ? `${n} más para Oro` : `${n} more for Gold`,
    moreForDiamond: (n: number) =>
      es ? `${n} más para Diamante` : `${n} more for Diamond`,
    autoPromote: (earned: string) =>
      es ? `↑ Auto-promoción → ${earned}` : `↑ Auto-promote → ${earned}`,
    trustBadge: es ? "Insignia de confianza" : "Trust badge",
    listing: es ? "Anuncio" : "Listing",
    reportedBy: es ? "Reportado por" : "Reported by",
    seller: es ? "Vendedor" : "Seller",
    service: es ? "Servicio" : "Service",
    buyer: es ? "Comprador" : "Buyer",
    feePaid: es ? "Comisión pagada" : "Commission paid",
    adminNote: es ? "Admin" : "Admin",
    noOpenReports: (open: boolean) =>
      es
        ? open
          ? "No hay reportes abiertos"
          : "No hay reportes"
        : open
          ? "No open reports"
          : "No reports",
    noOpenClaims: (open: boolean) =>
      es
        ? open
          ? "No hay reclamos de garantía abiertos"
          : "No hay reclamos de garantía"
        : open
          ? "No open guarantee claims"
          : "No guarantee claims",
    open: es ? "Abiertos" : "Open",
    all: es ? "Todos" : "All",
    reportStatus: (status: string) => {
      const m: Record<string, Record<Lang, string>> = {
        open: { es: "Abierto", en: "Open" },
        reviewed: { es: "Revisado", en: "Reviewed" },
        action_taken: { es: "Acción tomada", en: "Action taken" },
        dismissed: { es: "Descartado", en: "Dismissed" },
      };
      return m[status]?.[lang] ?? status.replace(/_/g, " ");
    },
    claimStatus: (status: string) => {
      const m: Record<string, Record<Lang, string>> = {
        open: { es: "Abierto", en: "Open" },
        under_review: { es: "En revisión", en: "Under review" },
        approved: { es: "Aprobado", en: "Approved" },
        denied: { es: "Rechazado", en: "Denied" },
        refunded: { es: "Reembolsado", en: "Refunded" },
      };
      return m[status]?.[lang] ?? status.replace(/_/g, " ");
    },
    reportMarkReviewed: es ? "Marcar revisado" : "Mark Reviewed",
    reportActionTaken: es ? "Acción tomada" : "Action Taken",
    reportDismiss: es ? "Descartar" : "Dismiss",
    claimReview: es ? "Revisar" : "Review",
    claimApprove: es ? "Aprobar" : "Approve",
    claimDeny: es ? "Rechazar" : "Deny",
    claimRefund: es ? "Reembolsar" : "Refund",
    noPendingListings: es
      ? "¡No hay proveedores pendientes — todo al día!"
      : "No pending providers — all caught up!",
    noListingsFound: es ? "No se encontraron anuncios" : "No listings found",
    verified: es ? "✅ Verificado" : "✅ Verified",
    pending: es ? "⏳ Pendiente" : "⏳ Pending",
    unknown: es ? "Desconocido" : "Unknown",
    noPhone: es ? "Sin teléfono" : "No phone",
    packageTitle:
      es
        ? "Paquete (opcional) — N sesiones, total $ MXN (acordado con el proveedor)"
        : "Package (optional) — N sessions, total $ MXN (agreed with provider)",
    sessions: es ? "Sesiones (≥2)" : "Sessions (≥2)",
    totalMxn: es ? "Total MXN" : "Total MXN",
    savePackage: es ? "Guardar paquete" : "Save package",
    packageHint:
      es
        ? "La tarifa de plataforma usa el % de comisión sobre este total. Deja ambos vacíos solo para precio de visita única."
        : "Platform fee uses % commission on this total. Leave both empty for single-visit list price only.",
    menuTitle: es ? "Menú de servicios (precios fijos)" : "Service menu (fixed prices)",
    menuExpand: es ? "Editar menú" : "Edit menu",
    menuCollapse: es ? "Ocultar menú" : "Hide menu",
    menuHint:
      es
        ? "Quita filas con ✕ y pulsa «Guardar menú» (o «Aprobar» guarda el menú también). Así el anuncio deja de mostrar la plantilla por defecto."
        : "Remove rows with ✕ and click «Save menu» (Approve saves the menu too). That stops the listing from showing the default template.",
    saveMenu: es ? "Guardar menú" : "Save menu",
    menuSaved: es ? "✅ Menú guardado" : "✅ Menu saved",
    viewListing: es ? "Ver anuncio público" : "View public listing",
    liveCalendarTitle: es ? "Sincronización de calendario en vivo" : "Live calendar sync",
    liveCalendarBody:
      es
        ? 'Muestra el bloque azul de “horarios en vivo” en el anuncio público cuando está activo. Rellena listing_live_availability_slots con tu job de sync; marca calendar_last_synced_at en SQL o en el job.'
        : 'Shows the blue “live openings” block on the public listing when enabled. Populate listing_live_availability_slots via your sync job; set calendar_last_synced_at in SQL or the job.',
    lastSynced: es ? "Última sincronización" : "Last synced",
    commissionPct: es ? "Comisión %" : "Commission %",
    updatePct: es ? "Actualizar %" : "Update %",
    approve: es ? "✓ Aprobar" : "✓ Approve",
    remove: es ? "Eliminar" : "Remove",
    reject: es ? "Rechazar" : "Reject",
    reportReasons: (reason: string) => {
      const m: Record<string, Record<Lang, string>> = {
        fraud: { es: "Fraude", en: "Fraud" },
        fake_listing: { es: "Anuncio falso", en: "Fake listing" },
        misleading: { es: "Engañoso", en: "Misleading" },
        inappropriate: { es: "Inapropiado", en: "Inappropriate" },
        spam: { es: "Spam", en: "Spam" },
        other: { es: "Otro", en: "Other" },
      };
      return m[reason]?.[lang] ?? reason;
    },
    claimReasons: (reason: string) => {
      const m: Record<string, Record<Lang, string>> = {
        no_show: { es: "No se presentó", en: "No-show" },
        poor_quality: { es: "Mala calidad", en: "Poor quality" },
        incomplete: { es: "Incompleto", en: "Incomplete" },
        overcharged: { es: "Cobro excesivo", en: "Overcharged" },
        safety_issue: { es: "Seguridad", en: "Safety" },
        other: { es: "Otro", en: "Other" },
      };
      return m[reason]?.[lang] ?? reason;
    },
    saveError: es ? "Error al guardar" : "Error saving",
    approveFail: es ? "No se pudo aprobar" : "Could not approve",
    rejectFail: es ? "No se pudo rechazar" : "Could not reject",
    commissionUpdated: (pct: number) =>
      es ? `✅ Comisión actualizada a ${pct}%` : `✅ Commission updated to ${pct}%`,
    commissionUpdateFail: es ? "No se pudo actualizar la comisión" : "Could not update commission",
    updateFail: es ? "No se pudo actualizar" : "Could not update",
    listingArchived: es ? "🗑️ Anuncio archivado" : "🗑️ Listing archived",
  };
}
