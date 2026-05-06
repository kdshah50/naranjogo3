"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  buyer_name: string;
  listing_title: string;
  booking_id?: string | null;
};

type ReviewsData = {
  reviews: Review[];
  average: number;
  total: number;
};

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill={i <= rating ? "#F59E0B" : "#E5E7EB"}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function StarsInteractive({
  rating,
  onChange,
  size = 28,
}: {
  rating: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="transition-transform hover:scale-110"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 20 20"
            fill={i <= (hover || rating) ? "#F59E0B" : "#D1D5DB"}
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </span>
  );
}

function timeAgo(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (lang === "en") {
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months} mo ago`;
  }
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? "es" : ""}`;
}

/** Review form shown to a buyer after a paid booking */
export function ReviewForm({
  bookingId,
  onSubmitted,
}: {
  bookingId: string;
  onSubmitted?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (rating === 0) {
      setError("Selecciona una calificación");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ bookingId, rating, comment: comment || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Error al enviar");
        return;
      }
      setDone(true);
      onSubmitted?.();
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <p className="text-emerald-700 font-semibold mb-1">¡Gracias por tu reseña!</p>
        <Stars rating={rating} size={20} />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E0D8] rounded-2xl p-6">
      <h3 className="font-semibold text-[#1C1917] mb-3">Califica al vendedor</h3>
      <div className="flex justify-center mb-4">
        <StarsInteractive rating={rating} onChange={setRating} />
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="¿Cómo fue tu experiencia? (opcional)"
        maxLength={1000}
        rows={3}
        className="w-full rounded-xl border border-[#E5E0D8] px-4 py-3 text-sm text-[#1C1917] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1B4332] resize-none mb-3"
      />
      {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || rating === 0}
        className="w-full py-3 rounded-xl bg-[#1B4332] text-white font-semibold text-sm disabled:opacity-50 hover:bg-[#2D6A4F] transition-colors"
      >
        {submitting ? "Enviando…" : "Enviar reseña"}
      </button>
    </div>
  );
}

/** Star summary badge — "4.8 ★ (12)" */
export function RatingSummary({
  average,
  total,
  size = 14,
}: {
  average: number;
  total: number;
  size?: number;
}) {
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[#6B7280]">
      <svg width={size} height={size} viewBox="0 0 20 20" fill="#F59E0B">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="font-semibold text-[#1C1917]">{average}</span>
      <span>({total})</span>
    </span>
  );
}

/** Full reviews list for a seller profile */
export default function SellerReviews({ sellerId, lang = "es" }: { sellerId: string; lang?: Lang }) {
  const es = lang === "es";
  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?sellerId=${sellerId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[#6B7280]">
        {es ? "Cargando reseñas…" : "Loading reviews…"}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="bg-white border border-[#E5E0D8] rounded-2xl p-6 text-center">
        <p className="text-[#6B7280] text-sm">
          {es ? "Este proveedor aún no tiene reseñas." : "This provider has no reviews yet."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl font-bold text-[#1C1917]">{data.average}</span>
        <div>
          <Stars rating={Math.round(data.average)} size={18} />
          <p className="text-xs text-[#6B7280] mt-0.5">
            {data.total}{" "}
            {es ? (data.total !== 1 ? "reseñas" : "reseña") : data.total !== 1 ? "reviews" : "review"}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {data.reviews.map((r) => (
          <div key={r.id} className="bg-white border border-[#E5E0D8] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#F4F0EB] flex items-center justify-center text-xs font-bold text-[#1B4332] flex-shrink-0">
                  {(r.buyer_name?.[0] ?? "C").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-semibold text-[#1C1917]">{r.buyer_name}</p>
                    {r.booking_id ? (
                      <span
                        className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        title={
                          es
                            ? "Reserva pagada verificada en Naranjogo"
                            : "Verified paid booking on Naranjogo"
                        }
                      >
                        {es ? "✓ Reserva verificada" : "✓ Verified booking"}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-[#9CA3AF] truncate">{r.listing_title}</p>
                </div>
              </div>
              <span className="text-[10px] text-[#9CA3AF] flex-shrink-0">{timeAgo(r.created_at, lang)}</span>
            </div>
            <Stars rating={r.rating} size={14} />
            {r.comment && (
              <p className="text-sm text-[#374151] mt-2 leading-relaxed">{r.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
