"use client";
import { useState, useRef } from "react";
import { useListingsStore } from "@/store/listings";

const CATEGORIES = [
  { id: "electronics", icon: "📱", label: "Electrónica" },
  { id: "vehicles",    icon: "🚗", label: "Vehículos" },
  { id: "fashion",     icon: "👗", label: "Moda" },
  { id: "home",        icon: "🏠", label: "Hogar" },
  { id: "services",    icon: "🔧", label: "Servicios" },
  { id: "realestate",  icon: "🏡", label: "Bienes Raíces" },
  { id: "sports",      icon: "⚽", label: "Deportes" },
];
const CITIES = ["CDMX","Guadalajara","Monterrey","Puebla","Tijuana","León","Mérida"];

function fmtMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

export default function SellModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]           = useState(1);
  const [photo, setPhoto]         = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiResult, setAiResult]   = useState<any>(null);
  const [title, setTitle]         = useState("");
  const [desc, setDesc]           = useState("");
  const [price, setPrice]         = useState("");
  const [category, setCategory]   = useState("electronics");
  const [city, setCity]           = useState("CDMX");
  const [negotiable, setNegotiable] = useState(false);
  const [shipping, setShipping]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addListing = useListingsStore(s => s.addListing);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhoto(url);
    setPhotoFile(file);
    setStep(2);

    // Call ML price suggestion from Next.js API → FastAPI
    setAiScanning(true);
    try {
      const res = await fetch("/api/ml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, condition: "good", title: file.name, location_state: city }),
      });
      const data = await res.json();
      setAiResult(data);
      if (data.suggested_price_mxn) setPrice(String(Math.round(data.suggested_price_mxn / 100)));
    } catch {}
    setAiScanning(false);
  };

  const handlePublish = async () => {
    if (!title || !price) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_es:           title,
          description_es:     desc,
          price_mxn:          (parseInt(price) || 0) * 100,
          category_id:        category,
          condition:          "good",
          location_city:      city,
          location_state:     "México",
          shipping_available: shipping,
          negotiable,
          photo_urls:         photo ? [photo] : [],
        }),
      });

      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? "Error al publicar");
      }

      const { id } = await res.json();

      // Optimistic update — show immediately in feed
      addListing({
        id,
        title,
        price_mxn:          (parseInt(price) || 0) * 100,
        category_id:        category,
        condition:          "good",
        location_city:      city,
        photo_url:          photo,
        shipping_available: shipping,
        negotiable,
        seller_name:        "Tú",
        seller_badge:       "none",
        seller_verified:    false,
      });

      setPublished(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (published) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-md p-10 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2">¡Publicado!</h2>
        <p className="text-[#6B7280] text-sm mb-6">Tu artículo ya está visible para compradores.</p>
        <button onClick={onClose} className="bg-[#1B4332] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#2D6A4F] transition-colors">
          Ver mi anuncio
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          {/* Handle */}
          <div className="w-10 h-1 bg-[#E5E0D8] rounded-full mx-auto mb-5" />

          {/* Progress */}
          <div className="flex gap-1.5 mb-6">
            {[1,2,3].map(s => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? "bg-[#1B4332]" : "bg-[#E5E0D8]"}`} />
            ))}
          </div>

          {/* Step 1 — Photo */}
          {step === 1 && (
            <div>
              <h2 className="font-serif text-xl font-bold mb-1">¿Qué quieres vender?</h2>
              <p className="text-sm text-[#6B7280] mb-5">Sube una foto y la IA detecta el artículo.</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-[#E5E0D8] rounded-2xl py-12 text-center cursor-pointer hover:border-[#1B4332] hover:bg-[#F4F0EB] transition-all"
              >
                <div className="text-4xl mb-2">📷</div>
                <p className="font-semibold text-sm mb-1">Agregar foto</p>
                <p className="text-xs text-[#6B7280]">La IA genera el título y precio sugerido</p>
              </div>
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <div>
              <h2 className="font-serif text-xl font-bold mb-4">Detalles del artículo</h2>
              {photo && <img src={photo} alt="" className="w-full h-40 object-cover rounded-xl mb-4" />}

              {aiScanning && (
                <div className="bg-[#F4F0EB] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-sm text-[#1B4332] font-medium">IA analizando imagen…</span>
                </div>
              )}

              {aiResult?.suggested_price_mxn && !aiScanning && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                  <p className="text-xs font-bold text-emerald-700 mb-1">✦ IA detectó:</p>
                  <p className="text-sm font-semibold text-emerald-800">
                    Precio sugerido: {fmtMXN(aiResult.suggested_price_mxn / 100)}
                  </p>
                  {aiResult.comparables_count > 0 && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Basado en {aiResult.comparables_count} artículos similares
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#6B7280] block mb-1">Título</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Ej: iPhone 14 Pro Max 256GB"
                    className="w-full px-3 py-2.5 border border-[#E5E0D8] rounded-xl text-sm focus:outline-none focus:border-[#1B4332]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6B7280] block mb-1">Descripción</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                    placeholder="Describe tu artículo..."
                    className="w-full px-3 py-2.5 border border-[#E5E0D8] rounded-xl text-sm focus:outline-none focus:border-[#1B4332] resize-none" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-[#6B7280] block mb-1">Precio (MXN)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">$</span>
                      <input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="0"
                        className="w-full pl-6 pr-3 py-2.5 border border-[#E5E0D8] rounded-xl text-sm focus:outline-none focus:border-[#1B4332]" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-[#6B7280] block mb-1">Ciudad</label>
                    <select value={city} onChange={e => setCity(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[#E5E0D8] rounded-xl text-sm focus:outline-none focus:border-[#1B4332] bg-white">
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#6B7280] block mb-1">Categoría</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[#E5E0D8] rounded-xl text-sm focus:outline-none focus:border-[#1B4332] bg-white">
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={negotiable} onChange={e => setNegotiable(e.target.checked)} className="accent-[#1B4332]" />
                    Negociable
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={shipping} onChange={e => setShipping(e.target.checked)} className="accent-[#1B4332]" />
                    Envío disponible
                  </label>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-[#1B4332] text-[#1B4332] rounded-xl text-sm font-medium hover:bg-[#1B4332] hover:text-white transition-colors">←</button>
                <button onClick={() => setStep(3)} disabled={!title || !price}
                  className="flex-1 py-2.5 bg-[#1B4332] text-white rounded-xl text-sm font-semibold hover:bg-[#2D6A4F] transition-colors disabled:opacity-40">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Publish */}
          {step === 3 && (
            <div>
              <h2 className="font-serif text-xl font-bold mb-1">Alcance y publicación</h2>
              <p className="text-sm text-[#6B7280] mb-5">Elige dónde mostrar tu anuncio.</p>

              {[
                { city: "CDMX",        desc: "8.2M compradores activos", active: true },
                { city: "Guadalajara", desc: "1.8M compradores activos", active: true },
                { city: "Monterrey",   desc: "+1.4M compradores",        active: false },
              ].map(row => (
                <div key={row.city} className="flex items-center gap-3 p-4 bg-[#F4F0EB] rounded-xl mb-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${row.active ? "bg-[#1B4332]" : "bg-white border border-[#E5E0D8]"}`}>
                    {row.active && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{row.city}</p>
                    <p className="text-xs text-[#6B7280]">{row.desc}</p>
                  </div>
                  {!row.active && <span className="text-xs font-bold text-[#D4A017] bg-yellow-50 px-2 py-0.5 rounded">Boost</span>}
                </div>
              ))}

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 my-4 flex items-center gap-3">
                <span className="text-xl">🛡️</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Compra Protegida</p>
                  <p className="text-xs text-emerald-700">Gratis para vendedores. Compradores pagan 3%.</p>
                </div>
              </div>

              {error && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-xl p-3">❌ {error}</p>}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="px-4 py-2.5 border border-[#1B4332] text-[#1B4332] rounded-xl text-sm font-medium hover:bg-[#1B4332] hover:text-white transition-colors">←</button>
                <button onClick={handlePublish} disabled={submitting}
                  className="flex-1 py-3 bg-[#D4A017] text-white rounded-xl text-sm font-semibold hover:bg-[#C4900D] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Publicando…</> : "✦ Publicar gratis"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
