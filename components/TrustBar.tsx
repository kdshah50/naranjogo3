export default function TrustBar() {
  const items = [
    { icon: "🛡️", title: "Compra protegida",     sub: "Escrow hasta confirmar" },
    { icon: "✓",  title: "Vendedores verificados", sub: "INE · RFC/CURP · teléfono" },
    { icon: "⚡", title: "Publicar en 30s",        sub: "IA detecta tu artículo" },
  ];
  return (
    <div className="bg-[#1B4332] py-10 px-4 mt-10">
      <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6 text-center">
        {items.map(item => (
          <div key={item.title}>
            <div className="text-3xl mb-2">{item.icon}</div>
            <p className="text-sm font-bold text-white mb-1">{item.title}</p>
            <p className="text-xs text-white/60">{item.sub}</p>
          </div>
        ))}
      </div>
      <div className="max-w-5xl mx-auto mt-8 pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <p className="text-white font-semibold text-sm">¿Ofreces un servicio en San Miguel de Allende?</p>
          <p className="text-white/60 text-xs mt-0.5">Are you a local service provider in SMA?</p>
        </div>
        <a href="/unete"
          className="bg-[#D4A017] hover:bg-[#C4900D] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap">
          ✓ Registra tu servicio gratis → Join us
        </a>
      </div>
      <div className="max-w-5xl mx-auto mt-4 flex flex-col sm:flex-row items-center justify-end gap-3 text-center sm:text-right">
        <a
          href="/limpieza-del-hogar"
          className="text-xs text-white/70 hover:text-white underline underline-offset-2"
        >
          ¿Limpieza del hogar? Conoce el programa → House cleaning program
        </a>
        <a
          href="/arreglos-de-ropa"
          className="text-xs text-white/70 hover:text-white underline underline-offset-2"
        >
          ¿Costurera o sastre? Conoce el programa de arreglos de ropa →
        </a>
      </div>
    </div>
  );
}
