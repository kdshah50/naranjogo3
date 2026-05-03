export default function GuaranteeBadge({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1"
        title="Solo aplica si pagaste la tarifa en Naranjogo. Fuera de la app no hay garantía ni disputas por la plataforma."
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        Garantía NaranjoGo
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-[#ECFDF5] border border-emerald-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-900">Garantía NaranjoGo</p>
          <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
            <strong>Solo si reservaste y pagaste la tarifa en Naranjogo:</strong> tu pago queda respaldado para
            disputas y posibles reembolsos. Si acuerdas fuera de la app, no podemos aplicar esta garantía.
          </p>
          <p className="text-xs text-emerald-800 mt-2 leading-relaxed">
            Si el proveedor no se presenta o el servicio no cumple lo acordado, puedes abrir un reporte y
            solicitar revisión.
          </p>
        </div>
      </div>
    </div>
  );
}
