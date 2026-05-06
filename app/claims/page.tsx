"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GuaranteeBadge from "@/components/GuaranteeBadge";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN, formatDateMedium } from "@/lib/locale-format";
import type { Lang } from "@/lib/i18n-lang";

type Booking = {
  id: string;
  listing_id: string;
  listing_title: string;
  seller_name: string;
  commission_amount_cents: number;
  paid_at: string;
};

type Claim = {
  id: string;
  booking_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

function reasonOptions(lang: Lang) {
  const es = lang === "es";
  return [
    { value: "no_show", label: es ? "El proveedor no se presentó" : "Provider no-show" },
    { value: "poor_quality", label: es ? "Mala calidad del servicio" : "Poor service quality" },
    { value: "incomplete", label: es ? "Servicio incompleto" : "Incomplete service" },
    { value: "overcharged", label: es ? "Me cobraron de más" : "I was overcharged" },
    { value: "safety_issue", label: es ? "Problema de seguridad" : "Safety issue" },
    { value: "other", label: es ? "Otro" : "Other" },
  ];
}

function statusLabels(lang: Lang): Record<string, { label: string; color: string; bg: string }> {
  const es = lang === "es";
  return {
    open: { label: es ? "Abierto" : "Open", color: "text-amber-700", bg: "bg-amber-50" },
    under_review: { label: es ? "En revisión" : "Under review", color: "text-blue-700", bg: "bg-blue-50" },
    approved: { label: es ? "Aprobado" : "Approved", color: "text-emerald-700", bg: "bg-emerald-50" },
    denied: { label: es ? "Denegado" : "Denied", color: "text-red-700", bg: "bg-red-50" },
    refunded: { label: es ? "Reembolsado" : "Refunded", color: "text-emerald-700", bg: "bg-emerald-50" },
  };
}

const COPY: Record<
  Lang,
  {
    profileLink: string;
    title: string;
    lead: string;
    newClaim: string;
    booking: string;
    selectBooking: string;
    reason: string;
    selectReason: string;
    details: string;
    detailsPh: string;
    send: string;
    sending: string;
    successMsg: string;
    sendError: string;
    explore: string;
    myClaims: string;
    noEligible: string;
  }
> = {
  es: {
    profileLink: "← Mi perfil",
    title: "Garantía Naranjogo",
    lead:
      "Si pagaste por un servicio y el proveedor no cumplió, puedes solicitar un reembolso. Revisaremos tu caso en 24-48 horas.",
    newClaim: "Nuevo reclamo",
    booking: "Reserva",
    selectBooking: "Selecciona una reserva",
    reason: "Motivo",
    selectReason: "Selecciona un motivo",
    details: "Detalles (opcional)",
    detailsPh: "Describe qué pasó con el mayor detalle posible...",
    send: "Enviar reclamo",
    sending: "Enviando...",
    successMsg: "Tu reclamo ha sido enviado. Nuestro equipo lo revisará en 24-48 horas.",
    sendError: "Error al enviar",
    explore: "Explorar servicios",
    myClaims: "Mis reclamos",
    noEligible: "No tienes reservas pagadas pendientes de reclamo.",
  },
  en: {
    profileLink: "← My profile",
    title: "Naranjogo guarantee",
    lead:
      "If you paid for a service and the provider did not deliver, you can request a refund. We'll review your case within 24-48 hours.",
    newClaim: "New claim",
    booking: "Booking",
    selectBooking: "Select a booking",
    reason: "Reason",
    selectReason: "Select a reason",
    details: "Details (optional)",
    detailsPh: "Describe what happened in as much detail as possible...",
    send: "Submit claim",
    sending: "Submitting...",
    successMsg: "Your claim was submitted. Our team will review it within 24-48 hours.",
    sendError: "Could not submit",
    explore: "Browse services",
    myClaims: "My claims",
    noEligible: "You have no paid bookings eligible for a claim.",
  },
};

function ClaimsContent() {
  const lang = useAppLang();
  const t = COPY[lang];
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);

  const REASON_OPTIONS = reasonOptions(lang);
  const STATUS_LABELS = statusLabels(lang);

  useEffect(() => {
    const bid =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("booking") : null;
    if (bid) {
      setSelectedBooking(bid);
      setReason("no_show");
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/bookings?status=paid", { credentials: "same-origin" }),
      fetch("/api/claims", { credentials: "same-origin" }),
    ])
      .then(async ([br, cr]) => {
        if (br.status === 401 || cr.status === 401) {
          router.push("/auth/login?returnTo=/claims");
          return;
        }
        const bData = br.ok ? await br.json() : { bookings: [] };
        const cData = cr.ok ? await cr.json() : { claims: [] };
        setBookings(Array.isArray(bData.bookings) ? bData.bookings : []);
        setClaims(Array.isArray(cData.claims) ? cData.claims : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const claimedBookingIds = new Set(claims.map((c) => c.booking_id));
  const eligibleBookings = bookings.filter((b) => !claimedBookingIds.has(b.id));

  const handleSubmit = async () => {
    if (!selectedBooking || !reason) return;
    setSubmitting(true);
    setMsg("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: selectedBooking, reason, details: details.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setMsg(t.successMsg);
      setMsgError(false);
      setSelectedBooking("");
      setReason("");
      setDetails("");
      const cRes = await fetch("/api/claims", { credentials: "same-origin" });
      if (cRes.ok) {
        const cData = await cRes.json();
        setClaims(Array.isArray(cData.claims) ? cData.claims : []);
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : t.sendError);
      setMsgError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/profile" className="text-sm text-[#6B7280] hover:text-[#1B4332] transition-colors">
          {t.profileLink}
        </Link>

        <div className="mt-4 mb-6">
          <GuaranteeBadge lang={lang} />
        </div>

        <h1 className="font-serif text-2xl font-bold text-[#1B4332] mb-2">{t.title}</h1>
        <p className="text-sm text-[#6B7280] mb-6">{t.lead}</p>

        {msg && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium mb-4 border ${
              msgError ? "bg-red-50 border-red-200 text-red-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {msg}
          </div>
        )}

        {eligibleBookings.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-6 mb-6 shadow-sm">
            <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-4">{t.newClaim}</h2>

            <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.booking}</label>
            <select
              value={selectedBooking}
              onChange={(e) => setSelectedBooking(e.target.value)}
              className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B4332] mb-3 bg-white"
            >
              <option value="">{t.selectBooking}</option>
              {eligibleBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.listing_title} — {b.seller_name} — {formatCurrencyMXN(b.commission_amount_cents, lang)}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.reason}</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B4332] mb-3 bg-white"
            >
              <option value="">{t.selectReason}</option>
              {REASON_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.details}</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={3000}
              placeholder={t.detailsPh}
              className="w-full border border-[#E5E0D8] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1B4332] mb-4"
            />

            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedBooking || !reason}
              className="w-full py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#2D6A4F] transition-colors disabled:opacity-40"
            >
              {submitting ? t.sending : t.send}
            </button>
          </div>
        )}

        {eligibleBookings.length === 0 && claims.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-sm text-[#6B7280]">{t.noEligible}</p>
            <Link href="/" className="inline-block mt-4 text-sm text-[#1B4332] font-semibold hover:underline">
              {t.explore}
            </Link>
          </div>
        )}

        {claims.length > 0 && (
          <div>
            <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-3">{t.myClaims}</h2>
            <div className="flex flex-col gap-3">
              {claims.map((c) => {
                const st = STATUS_LABELS[c.status] ?? STATUS_LABELS.open;
                const reasonLabel = REASON_OPTIONS.find((r) => r.value === c.reason)?.label ?? c.reason;
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                      <span className="text-[10px] text-[#9CA3AF]">{formatDateMedium(c.created_at, lang)}</span>
                    </div>
                    <p className="text-sm font-semibold text-[#1C1917] mb-1">{reasonLabel}</p>
                    {c.details && <p className="text-xs text-[#6B7280]">{c.details}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ClaimsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ClaimsContent />
    </Suspense>
  );
}
