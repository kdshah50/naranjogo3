"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import GuaranteeBadge from "@/components/GuaranteeBadge";

type BookingData = {
  id: string;
  listingId: string;
  paymentStatus: string;
  status: string;
  commissionAmountCents: number;
  paidAt: string | null;
  isBuyer: boolean;
  listing: { title: string; photo: string | null; priceMxn: number } | null;
  seller: { displayName: string; avatarUrl: string | null } | null;
  contact: { whatsappUrl: string | null } | null;
};

function formatMXN(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
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

function isTerminalPaymentStatus(ps: string | undefined) {
  return ps === "paid" || ps === "failed" || ps === "refunded";
}

function BookingSuccessContent() {
  const searchParams = useSearchParams();
  const stripeSessionId = searchParams.get("session_id");
  const bookingId = searchParams.get("id");
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollAttempt, setPollAttempt] = useState(0);
  const [retryBump, setRetryBump] = useState(0);

  useEffect(() => {
    if (!stripeSessionId && !bookingId) {
      setError("No se encontró la reserva");
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
        if (mounted) setError("No se pudo cargar la reserva");
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
          <p className="text-sm text-[#6B7280]">Confirmando tu pago…</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-sm">
          <p className="text-red-600 text-sm mb-4">{error || "Reserva no encontrada"}</p>
          <Link href="/" className="text-sm text-[#1B4332] font-semibold hover:underline">
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  const isPaid = data.paymentStatus === "paid";
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
              {isPaid ? "Reserva confirmada" : "Pago pendiente"}
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              {isPaid
                ? "Tu pago fue procesado exitosamente"
                : "Estamos procesando tu pago, espera un momento…"}
            </p>
            {showRetryPaid && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-amber-800">
                  Si ya pagaste en Stripe y esto no cambia, reintenta la confirmación (sincroniza con el banco).
                </p>
                <button
                  type="button"
                  onClick={() => retryConfirmation()}
                  className="text-sm font-semibold text-[#1B4332] underline hover:no-underline"
                >
                  Reintentar confirmación
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
                    <p className="text-xs text-[#6B7280]">Proveedor: {data.seller.displayName}</p>
                  )}
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Tarifa pagada: {formatMXN(data.commissionAmountCents)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp only — phone number not shown */}
          {isPaid && data.contact?.whatsappUrl && (
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">
                Contacto del proveedor
              </p>
              <a
                href={data.contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-colors"
                style={{ background: "#25D366", color: "white" }}
              >
                Contactar por WhatsApp
              </a>
              <p className="text-[11px] text-[#6B7280] text-center leading-snug">
                Abrimos WhatsApp por ti; no mostramos el número en pantalla.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 bg-[#F4F0EB] flex justify-between items-center flex-wrap gap-2">
            <Link
              href={`/listing/${data.listingId}`}
              className="text-sm text-[#1B4332] font-semibold hover:underline"
            >
              ← Volver al anuncio
            </Link>
            <Link
              href="/my-bookings"
              className="text-sm text-[#1B4332] font-semibold hover:underline"
            >
              Mis reservas
            </Link>
            <Link
              href="/messages"
              className="text-sm text-[#1B4332] font-semibold hover:underline"
            >
              Mensajes
            </Link>
          </div>
        </div>

        {isPaid && (
          <div className="mt-6 px-6">
            <p className="text-center text-sm text-[#374151] mb-2">
              Cuando el proveedor marque el servicio como completado, te avisaremos por WhatsApp para que puedas dejar
              tu reseña en{" "}
              <Link href="/my-bookings" className="font-semibold text-[#1B4332] hover:underline">
                Mis reservas
              </Link>
              .
            </p>
          </div>
        )}

        {isPaid && (
          <div className="mt-6">
            <GuaranteeBadge />
            <p className="text-center text-xs text-[#6B7280] mt-3">
              ¿Problemas con el servicio?{" "}
              <a href="/claims" className="text-[#1B4332] font-semibold hover:underline">
                Solicita un reembolso
              </a>
            </p>
          </div>
        )}

        {isPaid && (
          <p className="text-center text-xs text-[#6B7280] mt-4">
            Este contacto también está disponible en la página del servicio mientras tu reserva esté activa.
          </p>
        )}
      </div>
    </main>
  );
}
