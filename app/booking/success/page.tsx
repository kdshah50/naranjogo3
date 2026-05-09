"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import GuaranteeBadge from "@/components/GuaranteeBadge";
import BuyerRetentionPanel, { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import type { Lang } from "@/lib/i18n-lang";

type BookingData = {
  id: string;
  listingId: string;
  paymentStatus: string;
  status: string;
  ticketCode?: string | null;
  commissionAmountCents: number;
  paidAt: string | null;
  isBuyer: boolean;
  listing: { title: string; photo: string | null; priceMxn: number } | null;
  seller: { displayName: string; avatarUrl: string | null } | null;
  contact: { whatsappUrl: string | null } | null;
};

const BS: Record<
  Lang,
  {
    loadFallback: string;
    noRef: string;
    loadErr: string;
    notFound: string;
    home: string;
    confirming: string;
    paidTitle: string;
    pendingTitle: string;
    paidSub: string;
    pendingSub: string;
    retryHint: string;
    retryBtn: string;
    seller: string;
    feePaid: string;
    providerContact: string;
    waBtn: string;
    waNote: string;
    backListing: string;
    myBookings: string;
    messages: string;
    reviewBlurb: string;
    problems: string;
    refund: string;
    contactFooter: string;
    guaranteeCta: string;
    bookingLifecycleHeading: string;
    bookingLifecycleHint: string;
    bookingTicketLine: string;
    bookingPhaseConfirmed: string;
    bookingPhaseScheduled: string;
    bookingPhaseInProgress: string;
    bookingPhaseCompleted: string;
    bookingPhaseCancelled: string;
    bookingPhaseOther: string;
  }
> = {
  es: {
    loadFallback: "Cargando…",
    noRef: "No se encontró la reserva",
    loadErr: "No se pudo cargar la reserva",
    notFound: "Reserva no encontrada",
    home: "Volver al inicio",
    confirming: "Confirmando tu pago…",
    paidTitle: "Reserva confirmada",
    pendingTitle: "Pago pendiente",
    paidSub: "Tu pago fue procesado exitosamente",
    pendingSub: "Estamos procesando tu pago, espera un momento…",
    retryHint:
      "Si ya pagaste en Stripe y esto no cambia, reintenta la confirmación (sincroniza con el banco).",
    retryBtn: "Reintentar confirmación",
    seller: "Proveedor:",
    feePaid: "Tarifa pagada:",
    providerContact: "Contacto del proveedor",
    waBtn: "Contactar por WhatsApp",
    waNote: "Abrimos WhatsApp por ti; no mostramos el número en pantalla.",
    backListing: "← Volver al anuncio",
    myBookings: "Mis reservas",
    messages: "Mensajes",
    reviewBlurb:
      "Cuando el proveedor marque el servicio como completado, te avisaremos por WhatsApp para que puedas dejar tu reseña en",
    problems: "¿Problemas con el servicio?",
    refund: "Solicita un reembolso",
    contactFooter:
      "Este contacto también está disponible en la página del servicio mientras tu reserva esté activa.",
    guaranteeCta: "Centro de garantía y ayuda",
    bookingLifecycleHeading: "Estado del servicio",
    bookingLifecycleHint:
      "Se actualiza automáticamente cada 30 segundos mientras la reserva esté activa. También lo ves en «Mis reservas».",
    bookingTicketLine: "Ticket:",
    bookingPhaseConfirmed: "Pagado — confirmación enviada al proveedor",
    bookingPhaseScheduled: "Visita marcada como agendada por el proveedor",
    bookingPhaseInProgress: "El proveedor indicó que el trabajo está en curso",
    bookingPhaseCompleted: "El proveedor marcó el servicio como completado",
    bookingPhaseCancelled: "Reserva cancelada",
    bookingPhaseOther: "Estado",
  },
  en: {
    loadFallback: "Loading…",
    noRef: "Booking not found",
    loadErr: "Could not load booking",
    notFound: "Booking not found",
    home: "Back to home",
    confirming: "Confirming your payment…",
    paidTitle: "Booking confirmed",
    pendingTitle: "Payment pending",
    paidSub: "Your payment was processed successfully",
    pendingSub: "We're processing your payment, please wait…",
    retryHint:
      "If you already paid in Stripe and this doesn't update, retry confirmation (syncs with your bank).",
    retryBtn: "Retry confirmation",
    seller: "Provider:",
    feePaid: "Platform fee paid:",
    providerContact: "Provider contact",
    waBtn: "Contact via WhatsApp",
    waNote: "We open WhatsApp for you; we don't show the phone number on screen.",
    backListing: "← Back to listing",
    myBookings: "My bookings",
    messages: "Messages",
    reviewBlurb:
      "When the provider marks the service complete, we'll notify you on WhatsApp so you can leave your review in",
    problems: "Issues with the service?",
    refund: "Request a refund",
    contactFooter: "This contact is also on the service page while your booking is active.",
    guaranteeCta: "Guarantee & support hub",
    bookingLifecycleHeading: "Booking status",
    bookingLifecycleHint:
      "Updates every 30 seconds while this booking stays active—same info as under My bookings.",
    bookingTicketLine: "Ticket:",
    bookingPhaseConfirmed: "Paid — confirmation sent to the provider",
    bookingPhaseScheduled: "Provider marked your visit as scheduled",
    bookingPhaseInProgress: "Provider marked this job as in progress",
    bookingPhaseCompleted: "Provider marked this service as completed",
    bookingPhaseCancelled: "Booking cancelled",
    bookingPhaseOther: "Status",
  },
};

function bookingLifecycleTitle(status: string, t: (typeof BS)["es"]): string {
  switch (String(status ?? "")) {
    case "confirmed":
      return t.bookingPhaseConfirmed;
    case "scheduled":
      return t.bookingPhaseScheduled;
    case "in_progress":
      return t.bookingPhaseInProgress;
    case "completed":
      return t.bookingPhaseCompleted;
    case "cancelled":
      return t.bookingPhaseCancelled;
    default:
      return `${t.bookingPhaseOther}: ${status}`;
  }
}

export default function BookingSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-[#6B7280]">Cargando…</p>
          </div>
        </main>
      }
    >
      <BookingSuccessContent />
    </Suspense>
  );
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 25;
const LIFECYCLE_POLL_MS = 30_000;

function isTerminalPaymentStatus(ps: string | undefined) {
  return ps === "paid" || ps === "failed" || ps === "refunded";
}

function BookingSuccessContent() {
  const lang = useAppLang();
  const t = BS[lang];
  const searchParams = useSearchParams();
  const stripeSessionId = searchParams.get("session_id");
  const bookingId = searchParams.get("id");
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollAttempt, setPollAttempt] = useState(0);
  const [retryBump, setRetryBump] = useState(0);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!stripeSessionId && !bookingId) {
      setError(BS[langRef.current].noRef);
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchBooking = async () => {
      const url = stripeSessionId
        ? `/api/bookings/verify-session?session_id=${encodeURIComponent(stripeSessionId)}`
        : `/api/bookings/${bookingId}`;

      const res = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        if (mounted) setError(BS[langRef.current].loadErr);
        if (mounted) setLoading(false);
        return;
      }
      const json = (await res.json()) as BookingData & { paymentStatus?: string };

      const ps = json.paymentStatus;
      const shouldPoll =
        !isTerminalPaymentStatus(ps) && pollAttempt < MAX_POLL_ATTEMPTS;

      if (shouldPoll) {
        setTimeout(() => {
          if (mounted) setPollAttempt((r) => r + 1);
        }, POLL_INTERVAL_MS);
        return;
      }

      if (mounted) {
        setData(json);
        setLoading(false);
      }
    };

    void fetchBooking();
    return () => {
      mounted = false;
    };
  }, [stripeSessionId, bookingId, pollAttempt, retryBump]);

  const paidNotifyRef = useRef(false);
  useEffect(() => {
    if (!data?.listingId || data.paymentStatus !== "paid" || paidNotifyRef.current) return;
    paidNotifyRef.current = true;
    window.dispatchEvent(
      new CustomEvent("tianguis:booking-paid", { detail: { listingId: data.listingId } }),
    );
  }, [data]);

  useEffect(() => {
    const id = bookingId ?? data?.id ?? null;
    if (!id || !data || data.paymentStatus !== "paid") return;
    if (data.status === "completed" || data.status === "cancelled") return;

    const pollLifecycle = async () => {
      const res = await fetch(`/api/bookings/${id}`, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as BookingData;
      setData((prev) => {
        if (!prev) return json;
        return {
          ...prev,
          ...json,
          listing: json.listing ?? prev.listing,
          seller: json.seller ?? prev.seller,
          contact: json.contact ?? prev.contact,
        };
      });
    };

    const interval = window.setInterval(pollLifecycle, LIFECYCLE_POLL_MS);
    return () => clearInterval(interval);
  }, [bookingId, data?.id, data?.paymentStatus, data?.status]);

  const retryConfirmation = () => {
    setError("");
    setData(null);
    setLoading(true);
    setPollAttempt(0);
    setRetryBump((b) => b + 1);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#1B4332] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[#6B7280]">{t.confirming}</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-sm">
          <p className="text-red-600 text-sm mb-4">{error || t.notFound}</p>
          <Link href="/" className="text-sm text-[#1B4332] font-semibold hover:underline">
            {t.home}
          </Link>
        </div>
      </main>
    );
  }

  const isPaid = data.paymentStatus === "paid";
  const myBookingsHref =
    isPaid && data.ticketCode
      ? withLang(`/my-bookings?ticket=${encodeURIComponent(String(data.ticketCode))}`, lang)
      : withLang("/my-bookings", lang);
  const showRetryPaid =
    Boolean(stripeSessionId) &&
    !isPaid &&
    data.paymentStatus !== "failed" &&
    data.paymentStatus !== "refunded";
  return (
    <main className="min-h-screen bg-[#FDF8F1]">
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className={`px-6 py-5 text-center ${isPaid ? "bg-emerald-50" : "bg-amber-50"}`}>
            <div className="text-4xl mb-2">{isPaid ? "✓" : "⏳"}</div>
            <h1 className="text-xl font-bold text-[#1C1917]">
              {isPaid ? t.paidTitle : t.pendingTitle}
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              {isPaid ? t.paidSub : t.pendingSub}
            </p>
            {showRetryPaid && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-amber-800">{t.retryHint}</p>
                <button
                  type="button"
                  onClick={() => retryConfirmation()}
                  className="text-sm font-semibold text-[#1B4332] underline hover:no-underline"
                >
                  {t.retryBtn}
                </button>
              </div>
            )}
          </div>

          {/* Listing info */}
          {data.listing && (
            <div className="px-6 py-4 border-b border-[#E5E0D8]">
              <div className="flex items-center gap-3">
                {data.listing.photo && (
                  <Image
                    src={data.listing.photo}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold text-[#1C1917]">{data.listing.title}</p>
                  {data.seller && (
                    <p className="text-xs text-[#6B7280]">
                      {t.seller} {data.seller.displayName}
                    </p>
                  )}
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {t.feePaid} {formatCurrencyMXN(data.commissionAmountCents, lang)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isPaid && (
            <div className="px-6 py-4 border-b border-[#E5E0D8] bg-[#F9FAFB]">
              <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1">
                {t.bookingLifecycleHeading}
              </p>
              <p className="text-sm font-semibold text-[#1C1917]">{bookingLifecycleTitle(data.status, t)}</p>
              {data.ticketCode ? (
                <p className="text-xs text-[#4B5563] mt-1">
                  {t.bookingTicketLine}{" "}
                  <span className="font-mono font-semibold">{data.ticketCode}</span>
                </p>
              ) : null}
              {data.status !== "completed" && data.status !== "cancelled" ? (
                <p className="text-[11px] text-[#6B7280] mt-2 leading-snug">{t.bookingLifecycleHint}</p>
              ) : null}
            </div>
          )}

          {/* WhatsApp only — phone number not shown */}
          {isPaid && data.contact?.whatsappUrl && (
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">{t.providerContact}</p>
              <a
                href={data.contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors"
                style={{ background: "#25D366", color: "white" }}
              >
                {t.waBtn}
              </a>
              <p className="text-[11px] text-[#6B7280] text-center leading-snug">{t.waNote}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 bg-[#F4F0EB] flex justify-between items-center flex-wrap gap-2">
            <Link
              href={withLang(`/listing/${data.listingId}`, lang)}
              className="text-sm text-[#1B4332] font-semibold hover:underline"
            >
              {t.backListing}
            </Link>
            <Link href={myBookingsHref} className="text-sm text-[#1B4332] font-semibold hover:underline">
              {t.myBookings}
            </Link>
            <Link href={withLang("/messages", lang)} className="text-sm text-[#1B4332] font-semibold hover:underline">
              {t.messages}
            </Link>
          </div>
        </div>

        {isPaid && data.isBuyer && (
          <div className="mt-6">
            <BuyerRetentionPanel variant="post_payment" lang={lang} listingId={data.listingId} />
          </div>
        )}

        {isPaid && (
          <div className="mt-6 px-6">
            <p className="text-center text-sm text-[#374151] mb-2">
              {t.reviewBlurb}{" "}
              <Link href={myBookingsHref} className="font-semibold text-[#1B4332] hover:underline">
                {t.myBookings}
              </Link>
              .
            </p>
          </div>
        )}

        {isPaid && (
          <div className="mt-6">
            <GuaranteeBadge lang={lang} />
            <p className="text-center text-xs text-[#6B7280] mt-3">
              {t.problems}{" "}
              <Link href={withLang("/claims", lang)} className="text-[#1B4332] font-semibold hover:underline">
                {t.refund}
              </Link>
              {" · "}
              <Link href={withLang("/claims", lang)} className="text-[#1B4332] font-semibold hover:underline">
                {t.guaranteeCta}
              </Link>
            </p>
          </div>
        )}

        {isPaid && <p className="text-center text-xs text-[#6B7280] mt-4">{t.contactFooter}</p>}
      </div>
    </main>
  );
}
