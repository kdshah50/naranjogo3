export default function TrustBar() {
  const items = [
    { icon: "🛡️", title: "Compra protegida",     sub: "Escrow hasta confirmar" },
    { icon: "✓",  title: "Vendedores verificados", sub: "INE / teléfono" },
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
    </div>
  );
}
