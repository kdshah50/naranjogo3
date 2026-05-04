import type { Lang } from "@/lib/i18n-lang";

export default function GuaranteeBadge({
  compact,
  lang = "es",
}: {
  compact?: boolean;
  lang?: Lang;
}) {
  const en = lang === "en";

  const compactTitle = en
    ? "Book and pay on Naranjogo: if the provider no-shows, full refund of your platform payment. Arranging only on WhatsApp = no Naranjogo protection."
    : "Reserva y paga en Naranjogo: si el proveedor no se presenta, reembolso completo de lo pagado en la app. Solo por WhatsApp = sin protección Naranjogo.";

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 max-w-full"
        title={compactTitle}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span className="truncate">{en ? "Naranjogo protection" : "Protección Naranjogo"}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-[#ECFDF5] overflow-hidden shadow-sm">
      <div className="px-4 pt-4 pb-3 border-b border-emerald-100/80 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#065F46"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-950">
            {en ? "Naranjogo guarantee" : "Garantía Naranjogo"}
          </p>
          <p className="text-xs text-emerald-800 mt-1 leading-snug font-medium">
            {en
              ? "A clear choice — especially if you’re new in town and don’t have local contacts to lean on."
              : "Una promesa clara — especialmente si vives aquí sin red local que te respalde."}
          </p>
        </div>
      </div>

      <div className="p-3 grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-emerald-400 bg-white p-4 shadow-sm ring-1 ring-emerald-100">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            {en ? "Book through Naranjogo" : "Reserva por Naranjogo"}
          </p>
          <p className="text-sm font-bold text-emerald-950 mt-2 leading-snug">
            {en
              ? "If the provider doesn’t show up, you get a full refund of what you paid on the platform."
              : "Si el proveedor no se presenta, reembolso completo de lo que pagaste en la app."}
          </p>
          <p className="text-xs text-emerald-800 mt-2 leading-relaxed">
            {en
              ? "Pay the connection fee here first. If there’s a no-show, open a claim — we review and refund your Naranjogo payment."
              : "Primero pagas la tarifa aquí. Si hay ausencia, abres un reporte en la app: revisamos y reembolsamos lo pagado en Naranjogo."}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-stone-50/90 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-600">
            {en ? "Book only on WhatsApp" : "Solo por WhatsApp"}
          </p>
          <p className="text-sm font-bold text-stone-900 mt-2 leading-snug">
            {en ? "You’re on your own." : "Vas por tu cuenta."}
          </p>
          <p className="text-xs text-stone-600 mt-2 leading-relaxed">
            {en
              ? "If you arrange and pay outside the app, Naranjogo can’t apply this guarantee, disputes, or refunds."
              : "Si arreglas y pagas fuera de la app, Naranjogo no puede aplicar esta garantía, disputas ni reembolsos."}
          </p>
        </div>
      </div>
    </div>
  );
}
