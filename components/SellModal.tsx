"use client";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const MAX_PHOTOS = 10;

type PhotoItem = { file: File; preview: string };

const CATEGORIES = [
  { id: "electronics", icon: "📱", label: "Electrónica" },
  { id: "vehicles",    icon: "🚗", label: "Vehículos" },
  { id: "fashion",     icon: "👗", label: "Moda" },
  { id: "home",        icon: "🏠", label: "Hogar" },
  { id: "services",    icon: "🔧", label: "Servicios" },
  { id: "realestate",  icon: "🏡", label: "Bienes Raíces" },
  { id: "sports",      icon: "⚽", label: "Deportes" },
];

function fmtMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

export default function SellModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [aiSuggestedPrice, setAiSuggestedPrice] = useState<number | null>(null);
  const [aiComparables, setAiComparables] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("electronics");
  const [desc, setDesc] = useState("");
  const [city, setCity] = useState("CDMX");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    return () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.preview);
    };
  }, []);

  const addFiles = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    const incoming = Array.from(list);
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const take = incoming.slice(0, room);
      const next = take.map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...prev, ...next];
    });
  };

  const removePhotoAt = (index: number) => {
    setPhotos((prev) => {
      const p = prev[index];
      if (p) URL.revokeObjectURL(p.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const goToDetails = () => {
    if (!photos.length) return;
    setStep(2);
    runAI();
  };

  const runAI = async () => {
    setAiScanning(true);
    setAiDone(false);
    setAiSuggestedPrice(null);
    try {
      // Call via Next.js API proxy — no CORS issues
      const res = await fetch("/api/ml/price-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category === "services" ? "services" : category,
          condition: "good",
          title: title.trim() || "artículo",
          location_state: "CDMX",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const cents = data?.suggested_price_mxn;
        if (typeof cents === "number" && Number.isFinite(cents) && cents > 0) {
          const suggested = Math.round(cents / 100);
          setAiSuggestedPrice(suggested);
          setAiComparables(data.comparables_count ?? 12);
          setPrice(String(suggested));
        }
      }
    } catch {
      // AI unavailable — user fills manually, no error shown
    } finally {
      setAiScanning(false);
      setAiDone(true);
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!title || !price) return;
    setSubmitting(true);
    setError("");
    try {
      const photoUrls: string[] = [];
      for (const { file } of photos) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/upload-listing-photo", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
        const data = await up.json().catch(() => ({}));
        if (!up.ok) {
          setError(
            (data as { error?: string }).error ||
              "No se pudieron subir las fotos. ¿Iniciaste sesión? ¿Existe el bucket listing-photos?",
          );
          setSubmitting(false);
          return;
        }
        const url = (data as { url?: string }).url;
        if (url) photoUrls.push(url);
      }

      const res = await fetch("/api/listings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_es: title,
          title_en: title,
          description_es: desc || title,
          price_mxn: Math.round(parseFloat(price) * 100),
          category_id: category,
          condition: "good",
          status: "active",
          location_city: city,
          location_state: "CDMX",
          shipping_available: false,
          negotiable: true,
          photo_urls: photoUrls,
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => { onClose(); router.refresh(); }, 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError("Inicia sesión para publicar (arriba: Entrar).");
        } else {
          setError((err as { message?: string; error?: string }).message || (err as { error?: string }).error || "Error al publicar");
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success ───────────────────────────────────────────────────────────────
  if (done) return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg p-10 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="font-serif text-2xl font-bold text-[#1B4332] mb-2">¡Publicado!</h2>
        <p className="text-[#6B7280]">Tu artículo ya está visible para compradores.</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-9 h-1 bg-[#E5E0D8] rounded mx-auto mb-5" />

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded transition-all ${s <= step ? "bg-[#1B4332]" : "bg-[#E5E0D8]"}`} />
          ))}
        </div>

        {/* ── STEP 1: Upload photo ─────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 className="font-serif text-xl font-bold mb-1">¿Qué quieres vender?</h2>
            <p className="text-sm text-[#6B7280] mb-5">
              Sube hasta {MAX_PHOTOS} fotos (JPEG, PNG o WebP). La IA sugiere precio al continuar.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handlePhotoInput}
            />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {photos.map((p, i) => (
                  <div key={p.preview} className="relative aspect-square rounded-xl overflow-hidden bg-[#F4F0EB]">
                    <Image src={p.preview} alt="" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => removePhotoAt(i)}
                      className="absolute top-1 right-1 bg-black/55 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div
              onClick={() => photos.length < MAX_PHOTOS && fileRef.current?.click()}
              className={`border-2 border-dashed border-[#E5E0D8] rounded-2xl p-8 text-center transition-all ${
                photos.length >= MAX_PHOTOS
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:border-[#1B4332] hover:bg-[#F4F0EB]"
              }`}
            >
              <div className="text-4xl mb-2">📷</div>
              <p className="font-semibold text-[#1C1917] mb-1">
                {photos.length ? "Agregar más fotos" : "Agregar fotos"}
              </p>
              <p className="text-xs text-[#6B7280]">
                {photos.length}/{MAX_PHOTOS} · máx. 5 MB c/u
              </p>
            </div>
            <button
              type="button"
              onClick={goToDetails}
              disabled={!photos.length}
              className="w-full mt-5 bg-[#1B4332] text-white py-3 rounded-xl font-semibold disabled:opacity-40"
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ── STEP 2: AI scan + details ─────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h2 className="font-serif text-xl font-bold mb-4">Detalles del artículo</h2>

            {/* Photo previews */}
            {photos.length > 0 && (
              <div className="mb-4">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((p, i) => (
                    <div key={p.preview} className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden">
                      <Image src={p.preview} alt="" fill className="object-cover" unoptimized />
                      <button
                        type="button"
                        onClick={() => removePhotoAt(i)}
                        className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-semibold text-[#1B4332] underline"
                  >
                    Cambiar fotos
                  </button>
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-xs font-semibold text-[#6B7280]"
                    >
                      + Agregar ({photos.length}/{MAX_PHOTOS})
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handlePhotoInput}
                />
              </div>
            )}

            {/* AI scanning spinner */}
            {aiScanning && (
              <div className="bg-[#F4F0EB] rounded-xl p-3 mb-4 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm text-[#1B4332] font-medium">IA analizando imagen…</p>
                  <p className="text-xs text-[#6B7280]">Buscando precios similares en el mercado</p>
                </div>
              </div>
            )}

            {/* AI result banner */}
            {aiDone && aiSuggestedPrice && (
              <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-[#059669] tracking-wide">✦ IA DETECTÓ</p>
                  <span className="text-xs text-[#047857]">{aiComparables} artículos similares</span>
                </div>
                <p className="text-lg font-bold text-[#065F46]">
                  Precio sugerido: {fmtMXN(aiSuggestedPrice)}
                </p>
                <p className="text-xs text-[#047857] mt-0.5">
                  Pre-llenado abajo — ajusta si lo deseas
                </p>
              </div>
            )}

            {/* AI done but no price (API failed) */}
            {aiDone && !aiSuggestedPrice && (
              <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3 mb-4 flex items-center gap-2">
                <span className="text-base">💡</span>
                <p className="text-xs text-[#92400E]">
                  Ingresa el precio manualmente. La IA no pudo estimar el valor.
                </p>
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#6B7280] block mb-1">TÍTULO</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="ej. iPhone 14 Pro Max 256GB"
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1B4332]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B7280] block mb-1">
                  PRECIO — MXN $
                  {aiSuggestedPrice && (
                    <span className="ml-2 text-[#059669] font-normal">
                      · sugerido: {fmtMXN(aiSuggestedPrice)}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7280] text-sm">$</span>
                  <input
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    type="number"
                    placeholder="0"
                    className="w-full border border-[#E5E0D8] rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-[#1B4332]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B7280] block mb-1">DESCRIPCIÓN</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe tu artículo..."
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1B4332] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#6B7280] block mb-2">CATEGORÍA</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        category === c.id ? "bg-[#1B4332] text-white" : "bg-[#F4F0EB] text-[#1C1917]"
                      }`}
                    >
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="px-4 py-3 border border-[#1B4332] text-[#1B4332] rounded-xl font-semibold">←</button>
              <button
                onClick={() => setStep(3)}
                disabled={!title || !price}
                className="flex-1 bg-[#1B4332] text-white py-3 rounded-xl font-semibold disabled:opacity-40"
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Reach + publish ───────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h2 className="font-serif text-xl font-bold mb-1">Alcance y publicación</h2>
            <p className="text-sm text-[#6B7280] mb-5">Elige dónde mostrar tu anuncio.</p>

            {/* City selector */}
            <div className="space-y-2 mb-5">
              {[
                { city: "CDMX", buyers: "8.2M compradores" },
                { city: "Guadalajara", buyers: "1.8M compradores" },
                { city: "Monterrey", buyers: "1.4M compradores" },
                { city: "Puebla", buyers: "800K compradores" },
              ].map(({ city: c, buyers }) => (
                <div
                  key={c}
                  onClick={() => setCity(c)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    city === c ? "border-[#1B4332] bg-[#F0FDF4]" : "border-[#E5E0D8]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${city === c ? "border-[#1B4332]" : "border-[#E5E0D8]"}`}>
                    {city === c && <div className="w-2.5 h-2.5 rounded-full bg-[#1B4332]" />}
                  </div>
                  <div>
                    <span className="font-medium text-sm">{c}</span>
                    <span className="text-xs text-[#6B7280] ml-2">{buyers}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Buyer protection */}
            <div className="bg-[#F0FDF4] border border-[#A7F3D0] rounded-xl p-3 flex gap-3 mb-5">
              <span className="text-xl">🛡️</span>
              <div>
                <p className="text-sm font-semibold text-[#065F46]">Compra Protegida</p>
                <p className="text-xs text-[#047857]">Gratis para vendedores. Compradores pagan 3%.</p>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-3 border border-[#1B4332] text-[#1B4332] rounded-xl font-semibold">←</button>
              <button
                onClick={handlePublish}
                disabled={submitting}
                className="flex-1 bg-[#D4A017] text-white py-3 rounded-xl font-semibold disabled:opacity-60"
              >
                {submitting ? "Publicando..." : "✦ Publicar gratis"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
