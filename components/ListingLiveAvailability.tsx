import type { Lang } from "@/lib/i18n-lang";
import { formatLiveSlotRange, formatSyncedAt, type LiveSlotRow } from "@/lib/live-availability";

export default function ListingLiveAvailability({
  lang,
  syncEnabled,
  lastSyncedAt,
  slots,
}: {
  lang: Lang;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  slots: LiveSlotRow[];
}) {
  if (!syncEnabled && slots.length === 0) return null;

  const t =
    lang === "en"
      ? {
          title: "Live openings",
          syncedCaption: "Synced from this provider’s calendar — availability updates as their office agenda changes.",
          manualCaption: "Openings published by this provider.",
          emptySync:
            "This provider links their real calendar here; free times appear below when the next sync runs.",
          syncMeta: "Last updated",
          disclaimer:
            "Times are for planning only. You still message in the app, pay the platform fee, and confirm the exact visit in app messages with the provider.",
          slotAria: "Upcoming opening",
        }
      : {
          title: "Espacios en tiempo real",
          syncedCaption:
            "Sincronizado con la agenda del consultorio: la disponibilidad cambia cuando actualizan su calendario.",
          manualCaption: "Horarios publicados por el proveedor.",
          emptySync:
            "Este proveedor conecta su agenda real; los espacios libres aparecerán aquí cuando se actualice la sincronización.",
          syncMeta: "Última actualización",
          disclaimer:
            "Los horarios son orientativos. Sigues el mismo flujo: mensaje en la app, tarifa de la plataforma y confirmación final en los mensajes de la app con el proveedor.",
          slotAria: "Próximo espacio disponible",
        };

  const meta = formatSyncedAt(lastSyncedAt, lang);

  return (
    <div className="mb-6 rounded-xl border border-[#93C5FD] bg-[#EFF6FF] px-4 py-3">
      <p className="text-xs font-semibold text-[#1E3A5F] mb-1">{t.title}</p>
      <p className="text-[11px] text-[#1E40AF] leading-snug mb-3">
        {syncEnabled ? t.syncedCaption : t.manualCaption}
      </p>
      {syncEnabled && meta && (
        <p className="text-[10px] text-[#3B82F6] mb-2">
          {t.syncMeta}: {meta}
        </p>
      )}
      {slots.length === 0 ? (
        syncEnabled ? (
          <p className="text-sm text-[#1E3A8A] leading-relaxed">{t.emptySync}</p>
        ) : null
      ) : (
        <ul className="space-y-1.5 mb-3" aria-label={t.title}>
          {slots.map((row, i) => (
            <li
              key={`${row.slot_start}-${row.slot_end}-${i}`}
              className="text-sm text-[#0F172A] font-medium pl-3 border-l-2 border-[#3B82F6]"
            >
              <span className="sr-only">{t.slotAria} </span>
              {formatLiveSlotRange(row.slot_start, row.slot_end, lang)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[#475569] leading-snug border-t border-[#BFDBFE] pt-2 mt-1">{t.disclaimer}</p>
    </div>
  );
}
