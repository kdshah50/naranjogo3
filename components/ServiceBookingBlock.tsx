"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import {
  quoteAwaitingProviderLine,
  quoteSendRequestLine,
  serviceDepositConfirmLine,
} from "@/lib/service-quote-vertical";
import ServiceQuoteBuyerPanel from "@/components/ServiceQuoteBuyerPanel";

type BookingState = {
  isService: boolean;
  /** Full commission + contact payload (buyer, not seller). */
  flowActive?: boolean;
  needLogin?: boolean;
  isSeller?: boolean;
  canBook: boolean;
  contactedInApp: boolean;
  /** True while a new Stripe checkout for this listing is not allowed (active paid row, or package already paid). */
  checkoutBlocked: boolean;
  paidBookingId: string | null;
  revealedWhatsappUrl: string | null;
  hasPendingBooking: boolean;
  pendingBookingId: string | null;
  commissionAmountCents: number;
  /** Pre-loyalty fee when a loyalty discount applies (for strikethrough UI). */
  commissionBeforeLoyaltyCents?: number | null;
  loyaltyDiscountPctApplied?: number | null;
  loyaltyDiscountCents?: number | null;
  commissionPct: number;
  hasPackage?: boolean;
  packageSessionCount?: number | null;
  packageTotalMxnCents?: number | null;
  packageSavingsPctApprox?: number | null;
  packageSavingsMxnCents?: number | null;
  /** Latest paid booking lifecycle (for polling + buyer UI). */
  paidBookingStatus?: string | null;
  ticketCode?: string | null;
  listingPricingBaseMxnCents?: number;
  pricingBaseMxnCents?: number;
  agreedSubtotalMxnCents?: number | null;
  sellerAgreedPriceAt?: string | null;
  usingAgreedPrice?: boolean;
  sellerConnectReady?: boolean;
  requiresQuoteAccept?: boolean;
  quoteStatus?: string | null;
  quoteSentAt?: string | null;
  quoteAwaitingProvider?: boolean;
  canPayDeposit?: boolean;
  fullConnectPreview?: {
    subtotalCents: number;
    commissionCents: number;
    vatCents: number;
    totalCents: number;
    vatPercent: number;
    applicationFeeCents: number;
  } | null;
};

function formatMXN(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function paidBookingStatusCaption(status: string | null | undefined, lang: Lang): string {
  const s = String(status ?? "confirmed").toLowerCase();
  if (lang === "en") {
    if (s === "scheduled") return "Provider marked your visit as scheduled";
    if (s === "in_progress") return "Provider marked this job in progress";
    if (s === "completed") return "Provider marked this service completed";
    if (s === "cancelled") return "Booking cancelled";
    if (s === "pending") return "Payment processing";
    return "Paid — awaiting next update from provider";
  }
  if (s === "scheduled") return "El proveedor marcó tu visita como agendada";
  if (s === "in_progress") return "El proveedor marcó el trabajo en curso";
  if (s === "completed") return "El proveedor marcó el servicio como completado";
  if (s === "cancelled") return "Reserva cancelada";
  if (s === "pending") return "Procesando pago";
  return "Pagado — esperando actualización del proveedor";
}

/** Match auth-server: JWT sub is lowercased; `users.id` in DB can differ in letter case. */
function sameUserId(a: string | null | undefined, b: string | null | undefined) {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function ServiceBookingBlock({
  listingId,
  isService,
  sellerId,
  listingLang = "es",
  providerSlug = null,
  liveAvailability,
  loginReturnTo,
}: {
  listingId: string;
  isService: boolean;
  sellerId: string | null;
  /** From listing page `?lang=` — affects booking note copy only. */
  listingLang?: Lang;
  providerSlug?: string | null;
  /** When the listing shows synced / live openings (informational; flow unchanged). */
  liveAvailability?: { syncEnabled: boolean; upcomingSlotCount: number };
  /** Full listing URL for post-login redirect (preserve `?lang=` / `?chat=`). */
  loginReturnTo?: string;
}) {
  const [meId, setMeId] = useState<string | null | undefined>(undefined);
  const [booking, setBooking] = useState<BookingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loyaltyHint, setLoyaltyHint] = useState<{
    bookingsUntil: number;
    discountPct: number;
    rebookDiscount?: boolean;
    milestoneDiscount?: boolean;
    rebookDiscountPct?: number;
    milestoneDiscountPct?: number;
    everyN?: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const prevContacted = useRef(false);
  /** Buyer checkout: default tarifa sola; optional pago completo si el proveedor tiene Connect. */
  const [checkoutMode, setCheckoutMode] = useState<"commission_only" | "full_connect">("commission_only");

  const load = useCallback(async () => {
    setMsg("");
    const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (meRes.ok) {
      const j = await meRes.json();
      setMeId(j.user?.id ?? null);
    } else {
      setMeId(null);
    }

    const res = await fetch(`/api/listings/${listingId}/service-booking`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    let data = res.ok ? ((await res.json()) as BookingState) : null;
    const paidId = data?.paidBookingId;
    const paidSt = String(data?.paidBookingStatus ?? "").toLowerCase();
    if (paidId && paidSt !== "completed" && paidSt !== "cancelled") {
      try {
        const detail = await fetch(`/api/bookings/${encodeURIComponent(paidId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (detail.ok) {
          const row = (await detail.json()) as { status?: string };
          const st = String(row.status ?? "").trim();
          if (st && data) data = { ...data, paidBookingStatus: st };
        }
      } catch {
        /* non-fatal */
      }
    }
    setBooking(data);
    setLoading(false);

    // Fetch loyalty info (non-blocking)
    fetch("/api/loyalty", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.reward) {
          setLoyaltyHint({
            bookingsUntil: d.reward.bookingsUntilReward,
            discountPct: d.reward.discountPct,
            rebookDiscount: d.reward.rebookDiscount,
            milestoneDiscount: d.reward.milestoneDiscount,
            rebookDiscountPct: d.reward.rebookDiscountPct,
            milestoneDiscountPct: d.reward.milestoneDiscountPct,
            everyN: d.reward.everyN,
          });
        }
      })
      .catch(() => {});
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onContact = () => void load();
    const onPaid = () => void load();
    const onLifecycle = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && String(d.listingId) !== String(listingId)) return;
      void load();
    };
    window.addEventListener("tianguis:listing-contact", onContact);
    window.addEventListener("tianguis:booking-paid", onPaid);
    window.addEventListener("tianguis:booking-lifecycle", onLifecycle);
    const onAgreed = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && String(d.listingId) !== String(listingId)) return;
      void load();
    };
    window.addEventListener("tianguis:agreed-price-updated", onAgreed);
    const onQuote = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && String(d.listingId) !== String(listingId)) return;
      void load();
    };
    window.addEventListener("tianguis:quote-updated", onQuote);
    return () => {
      window.removeEventListener("tianguis:listing-contact", onContact);
      window.removeEventListener("tianguis:booking-paid", onPaid);
      window.removeEventListener("tianguis:booking-lifecycle", onLifecycle);
      window.removeEventListener("tianguis:agreed-price-updated", onAgreed);
      window.removeEventListener("tianguis:quote-updated", onQuote);
    };
  }, [load, listingId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  /**
   * Buyers rarely receive `tianguis:booking-lifecycle` (seller dashboard dispatches it). Poll while
   * checkout is blocked, payment is pending, or the latest paid booking is still in progress so
   * ticket codes and seller-driven status updates appear without a full page refresh.
   */
  useEffect(() => {
    if (!booking?.flowActive) return;
    const st = String(booking.paidBookingStatus ?? "");
    const activePaidLifecycle =
      Boolean(booking.paidBookingId) && st !== "completed" && st !== "cancelled";
    const quotePending = String(booking.quoteStatus ?? "") === "pending";
    const shouldPoll = Boolean(
      booking.checkoutBlocked || booking.hasPendingBooking || activePaidLifecycle || quotePending,
    );
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [
    load,
    booking?.flowActive,
    booking?.checkoutBlocked,
    booking?.hasPendingBooking,
    booking?.paidBookingId,
    booking?.paidBookingStatus,
    booking?.quoteStatus,
  ]);

  useEffect(() => {
    if (!booking?.sellerConnectReady || !booking?.fullConnectPreview || booking?.requiresQuoteAccept) {
      setCheckoutMode("commission_only");
    }
  }, [booking?.sellerConnectReady, booking?.fullConnectPreview, booking?.requiresQuoteAccept]);

  /** Server uses merged account (phone) to detect seller; client id match is fallback. */
  const iAmSellerOnThisListing = Boolean(booking?.isSeller) || Boolean(sellerId && meId && sameUserId(meId, sellerId));

  // When step 1 completes, scroll the pay section into view (buyers only — not the seller on their own ad)
  useEffect(() => {
    if (iAmSellerOnThisListing) return;
    const contacted = Boolean(booking?.contactedInApp);
    if (contacted && !prevContacted.current) {
      const el = document.getElementById("booking-section");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    prevContacted.current = contacted;
  }, [booking?.contactedInApp, booking?.isSeller, iAmSellerOnThisListing, meId, sellerId]);

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const startCheckout = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/bookings/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          note: note.trim() || undefined,
          checkoutMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : "";
        const serverMsg = typeof (data as { message?: string }).message === "string" ? (data as { message: string }).message : "";
        const err = (data as { error?: string }).error ?? "Error al crear pago";
        throw new Error(serverMsg || (detail ? `${err} ${detail}` : err));
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading || meId === undefined) {
    return (
      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-sm text-[#6B7280]">
        Cargando reservas…
      </div>
    );
  }

  if (iAmSellerOnThisListing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">{isService ? "Tu servicio" : "Tu anuncio"}</p>
        <p className="text-amber-800">
          {isService
            ? "Los clientes deben escribirte por mensajes en la app y pagar la tarifa de servicio antes de poder abrir tu WhatsApp desde Naranjogo."
            : "Los compradores deben escribirte por la app y pagar la tarifa de conexión antes de poder abrir tu WhatsApp desde Naranjogo."}
        </p>
      </div>
    );
  }

  if (!meId) {
    return (
      <div className="rounded-xl border border-[#E5E0D8] bg-[#F4F0EB] p-4">
        <p className="text-sm font-semibold text-[#1C1917] mb-2">
          {isService ? "Reservar este servicio" : "Contactar al vendedor"}
        </p>
        <p className="text-xs text-[#6B7280] mb-3">
          {isService
            ? "Inicia sesión, platica con el proveedor y paga la tarifa de servicio para abrir su WhatsApp desde aquí."
            : "Inicia sesión, envía un mensaje en la app y paga la tarifa de conexión para desbloquear WhatsApp."}
        </p>
        <Link
          href={`/auth/login?returnTo=${encodeURIComponent(loginReturnTo ?? `/listing/${listingId}`)}`}
          className="inline-block px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold"
        >
          Iniciar sesión para continuar
        </Link>
      </div>
    );
  }

  if (!booking?.flowActive) return null;

  const contacted = booking.contactedInApp;
  const partyLabel = isService ? "proveedor" : "vendedor";
  const hasPaid = booking.checkoutBlocked;
  const requiresQuote = Boolean(booking.requiresQuoteAccept);
  const quoteStatus = String(booking.quoteStatus ?? "none");
  const canPayDeposit = booking.canPayDeposit !== false;
  const quoteBlocksPay = requiresQuote && !canPayDeposit && !hasPaid;
  const showPayStep = contacted && !hasPaid && !quoteBlocksPay;

  const liveHintEn =
    liveAvailability?.syncEnabled && (liveAvailability.upcomingSlotCount ?? 0) > 0
      ? " You can reference a time from the live openings above; the provider still confirms on WhatsApp."
      : liveAvailability?.syncEnabled
        ? " This provider syncs their office calendar here; new openings appear when their agenda updates."
        : "";
  const liveHintEs =
    liveAvailability?.syncEnabled && (liveAvailability.upcomingSlotCount ?? 0) > 0
      ? " Puedes citar un horario de los espacios en azul arriba; el proveedor confirma por WhatsApp."
      : liveAvailability?.syncEnabled
        ? " Este proveedor sincroniza su agenda en la app; los espacios se actualizan cuando cambia su calendario."
        : "";

  const noteCopy =
    listingLang === "en"
      ? {
          label: "Message for the provider (optional)",
          hint:
            "Suggest times that work for you (e.g. weekday mornings, after 4pm). The exact time is confirmed on WhatsApp — not by this note alone." +
            liveHintEn,
          ph: "Preferred windows: e.g. Tue/Thu afternoons, or Sat before 1pm…",
        }
      : {
          label: "Mensaje para el proveedor (opcional)",
          hint:
            "Indica horarios o días que te funcionan (ej. mañanas, después de las 16 h). La hora exacta se confirma por WhatsApp — no solo con esta nota." +
            liveHintEs,
          ph: "Ventanas preferidas: ej. mar/jue por la tarde, o sábado antes de 13 h…",
        };

  // STEP 3: Contact revealed — buyer has paid (WhatsApp link only; phone not exposed in UI/API)
  if (hasPaid && booking.revealedWhatsappUrl) {
    const paidTitle =
      listingLang === "en"
        ? isService
          ? "Service reserved"
          : "Contact unlocked"
        : isService
          ? "Servicio reservado"
          : "Contacto desbloqueado";

    const paidLeadService =
      listingLang === "en"
        ? "You've already paid the service fee. The service provider will contact you shortly to confirm your scheduled booking time."
        : "Ya pagaste la tarifa de servicio. El proveedor te contactará en breve para confirmar la fecha y hora de tu reserva.";

    const paidLeadGoods =
      listingLang === "en"
        ? "You've already paid the connection fee. Open WhatsApp below to message the seller."
        : "Ya pagaste la tarifa de conexión. Abre WhatsApp abajo para escribir al vendedor.";

    const whatsAppCta =
      listingLang === "en"
        ? isService
          ? "Contact your service provider"
          : "Contact on WhatsApp"
        : isService
          ? "Contactar al proveedor del servicio"
          : "Contactar por WhatsApp";

    const paidFooterService =
      listingLang === "en"
        ? "You can reach the provider sooner via the green button below. Naranjogo does not hold the provider's calendar — timing is agreed between you and the provider."
        : "Si quieres adelantar contacto con el proveedor del servicio, usa el botón verde abajo. Naranjogo no aparta la agenda del proveedor: la hora la acuerdan ustedes.";

    const paidFooterGoods =
      listingLang === "en"
        ? "Confirm date and time with the seller on WhatsApp. Naranjogo does not reserve their calendar — agreement is between you and the seller."
        : "Confirma fecha y hora exactas con el vendedor por WhatsApp. Naranjogo no aparta la agenda del vendedor: el acuerdo es entre ustedes.";

    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-100">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
            <span className="text-lg">✓</span> {paidTitle}
          </h3>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-emerald-800">{isService ? paidLeadService : paidLeadGoods}</p>
          {booking.hasPackage && booking.packageSessionCount != null && booking.packageSessionCount >= 2 && (
            <p className="text-xs text-emerald-900 font-medium bg-white/60 rounded-lg px-2 py-1.5 border border-emerald-200/80">
              {listingLang === "en"
                ? `This payment covers your ${booking.packageSessionCount}-visit plan. Schedule each visit on WhatsApp—your next rebook on Naranjogo can unlock loyalty discounts.`
                : `Este pago cubre tu plan de ${booking.packageSessionCount} visitas. Agenda cada cita por WhatsApp; tu próxima reserva en Naranjogo puede sumar descuentos por lealtad.`}
            </p>
          )}
          {(booking.paidBookingStatus || booking.ticketCode) && (
            <div className="rounded-lg border border-emerald-200/90 bg-white/80 px-3 py-2 space-y-1">
              {booking.paidBookingStatus ? (
                <p className="text-[11px] font-semibold text-emerald-950 leading-snug">
                  {paidBookingStatusCaption(booking.paidBookingStatus, listingLang)}
                </p>
              ) : null}
              {booking.ticketCode ? (
                <p className="text-[11px] text-emerald-900">
                  <span className="text-emerald-800 font-semibold uppercase tracking-wide">
                    {listingLang === "en" ? "Ticket" : "Ticket"}
                  </span>{" "}
                  <span className="font-mono font-bold">{booking.ticketCode}</span>
                </p>
              ) : (
                <p className="text-[10px] text-amber-900/90 italic">
                  {listingLang === "en"
                    ? "Ticket code generating… this page refreshes automatically."
                    : "Generando código de ticket… esta página se actualiza sola."}
                </p>
              )}
            </div>
          )}
          {booking.revealedWhatsappUrl && (
            <a
              href={booking.revealedWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              style={{ background: "#25D366", color: "white" }}
            >
              {whatsAppCta}
            </a>
          )}
          <p className="text-xs text-emerald-900/90 leading-relaxed border-t border-emerald-200/60 pt-3">
            {isService ? paidFooterService : paidFooterGoods}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB]">
        <h3 className="text-sm font-bold text-[#1C1917]">{isService ? "Reservar servicio" : "Comprar / contactar"}</h3>
        {booking.hasPackage && booking.packageSessionCount && booking.packageTotalMxnCents != null && (
          <div className="mt-2 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/90 border-2 border-amber-200 px-3 py-3 text-xs text-amber-950 space-y-2">
            <p className="font-bold text-sm">
              {listingLang === "en"
                ? `Multi-visit plan: ${booking.packageSessionCount} sessions`
                : `Plan de ${booking.packageSessionCount} visitas`}
            </p>
            <p>
              <strong>{listingLang === "en" ? "Total for the plan:" : "Total del plan:"}</strong>{" "}
              {formatMXN(booking.packageTotalMxnCents)}{" "}
              {listingLang === "en"
                ? "— platform fee below is calculated on this agreed amount (one payment unlocks the whole plan)."
                : "— la tarifa de plataforma abajo se calcula sobre este monto (un solo pago desbloquea todo el plan)."}
            </p>
            {booking.packageSavingsPctApprox != null && booking.packageSavingsPctApprox > 0 && (
              <p className="text-emerald-800 font-semibold">
                {listingLang === "en"
                  ? `~${booking.packageSavingsPctApprox}% less than paying ${booking.packageSessionCount} visits at the list price.`
                  : `~${booking.packageSavingsPctApprox}% menos que pagar ${booking.packageSessionCount} visitas al precio del anuncio.`}
              </p>
            )}
            <p className="text-amber-900/95 text-[11px] leading-relaxed border-t border-amber-200/80 pt-2">
              {listingLang === "en"
                ? "Schedule each visit on WhatsApp with your provider. Rebook follow-ups through Naranjogo to keep discounts and guarantee coverage—stays on-platform."
                : "Coordina cada cita por WhatsApp. Para seguimiento y nuevas reservas, usa Naranjogo: ahí aplican tus descuentos por lealtad y la garantía (te encaja si sueles ir varias veces al mes)."}
            </p>
          </div>
        )}
        <p className="text-xs text-[#6B7280] mt-1">
          {booking.hasPackage ? (
            listingLang === "en" ? (
              <>
                One <strong>platform fee</strong> covers all <strong>{booking.packageSessionCount} visits</strong> in the
                approved plan (commission on the plan total, min. $10 MXN). Stay on Naranjogo for loyalty, guarantee, and
                follow-up bookings—like a multi-visit or monthly rhythm without paying list price each time.
              </>
            ) : (
              <>
                Una sola <strong>tarifa de plataforma</strong> cubre las{" "}
                <strong>{booking.packageSessionCount} visitas</strong> del plan aprobado (comisión sobre el total del plan,
                mín. $10 MXN). Sigue en Naranjogo: lealtad, garantía y re-reservas — ideal si vas varias veces al mes.
              </>
            )
          ) : isService ? (
            listingLang === "en" ? (
              <>
                The price is agreed directly with your provider. You only pay Naranjogo&apos;s{" "}
                <strong>platform fee</strong> here (~commission; minimum $10 MXN via Stripe) to continue booking.
              </>
            ) : (
              <>
                El precio del anuncio lo acuerdas con el proveedor. Aquí solo pagas la{" "}
                <strong>tarifa de la plataforma</strong> (~comisión; mín. $10 MXN por Stripe) para seguir con la reserva.
              </>
            )
          ) : (
            <>
              El precio del artículo lo acuerdas con el vendedor (o pagas fuera de la app). Aquí solo pagas la{" "}
              <strong>tarifa de conexión</strong> de Naranjogo (comisión; mín. $10 MXN) para desbloquear su WhatsApp.
            </>
          )}
        </p>
      </div>

      {/* Progress steps */}
      <div className="px-4 py-3 space-y-2 text-xs text-[#374151]">
        <div className="flex items-center gap-2">
          <span className={contacted ? "text-emerald-600 font-bold" : "text-[#9CA3AF]"}>
            {contacted ? "✓" : "1"}
          </span>
          <span className={contacted ? "text-emerald-700 font-medium" : ""}>
            {listingLang === "en"
              ? isService
                ? "Send your provider an in-app message"
                : "Send the seller an in-app message"
              : `Envía un mensaje al ${partyLabel} en la app`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={hasPaid ? "text-emerald-600 font-bold" : "text-[#9CA3AF]"}>
            {hasPaid ? "✓" : "2"}
          </span>
          <span>
            {booking.hasPackage
              ? listingLang === "en"
                ? `Pay one platform fee for the full plan (${formatMXN(booking.commissionAmountCents)})`
                : `Paga una tarifa para todo el plan (${formatMXN(booking.commissionAmountCents)})`
              : listingLang === "en"
                ? isService
                  ? `Pay the service fee (${formatMXN(booking.commissionAmountCents)})`
                  : `Pay the connection fee (${formatMXN(booking.commissionAmountCents)})`
                : `Paga la tarifa ${isService ? "de servicio" : "de conexión"} (${formatMXN(booking.commissionAmountCents)})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={hasPaid ? "text-emerald-600 font-bold" : "text-[#9CA3AF]"}>
            {hasPaid ? "✓" : "3"}
          </span>
          <span>
            {isService
              ? booking.hasPackage && booking.packageSessionCount
                ? listingLang === "en"
                  ? `Open the service provider's WhatsApp (${booking.packageSessionCount}-visit plan)`
                  : `Abre el WhatsApp del proveedor del servicio (${booking.packageSessionCount} visitas)`
                : listingLang === "en"
                  ? "Open the service provider's WhatsApp"
                  : "Abre el WhatsApp del proveedor del servicio"
              : booking.hasPackage && booking.packageSessionCount
                ? `WhatsApp del proveedor para las ${booking.packageSessionCount} visitas`
                : "Abre WhatsApp del vendedor (enlace en la app)"}
          </span>
        </div>
      </div>

      {/* STEP 1: Not yet contacted — tell buyer to use chat above */}
      {!contacted && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-800 leading-relaxed">
              {listingLang === "en" ? (
                isService ? (
                  <>
                    <strong>Step 1:</strong> In <strong>Messages</strong> (above), message your provider and send it.{" "}
                    <strong>After that</strong>, the <strong>step 2 pay button</strong> appears
                    {" "}(Stripe only collects the platform fee — not the service price.)
                  </>
                ) : (
                  <>
                    <strong>Step 1:</strong> Use <strong>Messages</strong> above and contact the seller.{" "}
                    <strong>After sending,</strong> you&apos;ll see <strong>Pay … and unlock WhatsApp</strong>
                    {" "}(Stripe is only Naranjogo&apos;s connection fee, not the item price.)
                  </>
                )
              ) : isService ? (
                <>
                  <strong>Paso 1:</strong> En <strong>Mensajes en la app</strong> (recuadro de arriba), escribe al{" "}
                  {partyLabel} y envía el mensaje. <strong>Después de enviarlo</strong>, aparece el botón{" "}
                  <strong>para pagar la tarifa del paso 2</strong>
                  {" "} (solo la tarifa de plataforma en Stripe — no el precio del anuncio).
                </>
              ) : (
                <>
                  <strong>Paso 1:</strong> En <strong>Mensajes en la app</strong> (recuadro de arriba), escribe al{" "}
                  {partyLabel} y envía el mensaje. <strong>Después de enviarlo</strong>, aparece el botón{" "}
                  <strong>Pagar … y desbloquear WhatsApp</strong>
                  {" "}(el pago en Stripe es solo la tarifa de conexión, no el precio del artículo).
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void manualRefresh()}
            disabled={refreshing || loading}
            className="w-full py-2.5 rounded-xl border border-[#1B4332] text-[#1B4332] text-xs font-semibold hover:bg-[#ECFDF5] disabled:opacity-50"
          >
            {refreshing ? "Actualizando…" : "Ya envié mi mensaje — actualizar"}
          </button>
        </div>
      )}

      {/* STEP 2: Quote pending (housekeeping) */}
      {contacted && quoteBlocksPay && (
        <div className="px-4 pb-4 space-y-3">
          {quoteStatus === "pending" ? (
            <ServiceQuoteBuyerPanel
              listingId={listingId}
              quoteStatus="pending"
              agreedSubtotalMxnCents={
                booking.agreedSubtotalMxnCents ?? booking.pricingBaseMxnCents ?? null
              }
              quoteSentAt={booking.quoteSentAt ?? null}
              lang={listingLang === "en" ? "en" : "es"}
              onResponded={() => void load()}
            />
          ) : null}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
            <p className="text-xs text-blue-900 leading-relaxed">
              {quoteStatus === "pending" ? (
                listingLang === "en" ? (
                  <>
                    <strong>Step 2:</strong> Your provider sent a quote — open <strong>Messages</strong> above to{" "}
                    <strong>Accept</strong> or <strong>Decline</strong>. After accepting, pay the deposit here.
                  </>
                ) : (
                  <>
                    <strong>Paso 2:</strong> Tu proveedor envió una cotización — en <strong>Mensajes</strong> arriba{" "}
                    <strong>Acepta</strong> o <strong>Rechaza</strong>. Después paga el depósito aquí.
                  </>
                )
              ) : quoteStatus === "declined" ? (
                listingLang === "en"
                  ? "You declined the quote. Wait for a revised quote from your provider, or send a new request in chat."
                  : "Rechazaste la cotización. Espera una cotización revisada o envía una nueva solicitud en el chat."
              ) : booking.quoteAwaitingProvider ? (
                listingLang === "en" ? (
                  <>
                    <strong>Step 2 — waiting:</strong> {quoteAwaitingProviderLine(providerSlug, "en")}
                  </>
                ) : (
                  <>
                    <strong>Paso 2 — en espera:</strong> {quoteAwaitingProviderLine(providerSlug, "es")}
                  </>
                )
              ) : listingLang === "en" ? (
                <>
                  <strong>Step 2:</strong> {quoteSendRequestLine(providerSlug, "en")}
                </>
              ) : (
                <>
                  <strong>Paso 2:</strong> {quoteSendRequestLine(providerSlug, "es")}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              document.getElementById("listing-inapp-chat")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="w-full py-2.5 rounded-xl border border-[#1B4332] text-[#1B4332] text-xs font-semibold hover:bg-[#ECFDF5]"
          >
            {listingLang === "en" ? "Go to messages & quote" : "Ir a mensajes y cotización"}
          </button>
        </div>
      )}

      {/* STEP 2: Contacted, ready to pay deposit */}
      {showPayStep && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800">
              <strong>{listingLang === "en" ? "Step 2:" : "Paso 2:"}</strong>{" "}
              {requiresQuote
                ? serviceDepositConfirmLine(providerSlug, listingLang)
                : isService
                  ? listingLang === "en"
                    ? "Pay the service fee below to continue."
                    : "Paga la tarifa de servicio abajo para continuar."
                  : listingLang === "en"
                    ? "Pay the connection fee to open the seller’s WhatsApp."
                    : "Paga la tarifa de conexión para recibir el WhatsApp del vendedor."}
            </p>
          </div>

          {booking.usingAgreedPrice &&
            booking.agreedSubtotalMxnCents != null &&
            booking.agreedSubtotalMxnCents > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 leading-relaxed">
                {listingLang === "en" ? (
                  <>
                    <strong>Agreed job total:</strong> {formatMXN(booking.agreedSubtotalMxnCents)} (set by your provider).
                    Platform fee is calculated on this amount.
                  </>
                ) : (
                  <>
                    <strong>Precio acordado del trabajo:</strong> {formatMXN(booking.agreedSubtotalMxnCents)} (fijado por tu
                    proveedor). La tarifa de Naranjogo se calcula sobre este monto.
                  </>
                )}
              </div>
            )}

          {booking.sellerConnectReady && booking.fullConnectPreview && !requiresQuote && (
            <div className="rounded-xl border border-[#E5E0D8] bg-white p-3 space-y-2">
              <p className="text-[11px] font-semibold text-[#374151]">
                {listingLang === "en" ? "How do you want to pay?" : "¿Cómo quieres pagar?"}
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="checkout-mode"
                  className="mt-1"
                  checked={checkoutMode === "commission_only"}
                  onChange={() => setCheckoutMode("commission_only")}
                />
                <span className="text-xs text-[#374151] leading-snug">
                  {listingLang === "en" ? (
                    <>
                      <strong>Platform fee only</strong> — same as before. You coordinate the service price directly with
                      the provider (cash, transfer, etc.).
                    </>
                  ) : (
                    <>
                      <strong>Solo tarifa de plataforma</strong> — como antes. El precio del servicio lo liquidas directo
                      con el proveedor (efectivo, transferencia, etc.).
                    </>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="checkout-mode"
                  className="mt-1"
                  checked={checkoutMode === "full_connect"}
                  onChange={() => setCheckoutMode("full_connect")}
                />
                <span className="text-xs text-[#374151] leading-snug">
                  {listingLang === "en" ? (
                    <>
                      <strong>Pay the full service in the app</strong> — service subtotal + platform fee + VAT (IVA), via
                      Stripe Connect to your provider when they have payouts enabled.
                    </>
                  ) : (
                    <>
                      <strong>Pagar el servicio completo en la app</strong> — subtotal del servicio + comisión + IVA, vía
                      Stripe Connect al proveedor cuando tiene cobros activos.
                    </>
                  )}
                </span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[#374151] mb-1">{noteCopy.label}</label>
            <p className="text-[10px] text-[#6B7280] mb-2 leading-snug">{noteCopy.hint}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={noteCopy.ph}
              className="w-full rounded-xl border border-[#E5E0D8] px-3 py-2 text-sm outline-none focus:border-[#1B4332]"
            />
          </div>

          {booking.loyaltyDiscountPctApplied != null &&
            booking.loyaltyDiscountPctApplied > 0 &&
            booking.commissionBeforeLoyaltyCents != null &&
            booking.commissionBeforeLoyaltyCents > booking.commissionAmountCents && (
              <div className="space-y-2">
                <div className="bg-gradient-to-r from-emerald-700 to-[#065F46] rounded-xl p-3 text-center">
                  <p className="text-xs font-semibold text-white leading-snug">
                    {listingLang === "en"
                      ? `⭐ ${booking.loyaltyDiscountPctApplied}% loyalty discount applied — the amount below matches what you pay in Stripe.`
                      : `⭐ ${booking.loyaltyDiscountPctApplied}% de descuento por lealtad aplicado — el monto de abajo es el que pagarás en Stripe.`}
                  </p>
                </div>
                {loyaltyHint && !loyaltyHint.milestoneDiscount && loyaltyHint.bookingsUntil > 0 && (
                  <p className="text-[11px] text-center text-emerald-800 font-medium leading-snug px-1">
                    {listingLang === "en" ? (
                      <>
                        {loyaltyHint.bookingsUntil} more paid booking{loyaltyHint.bookingsUntil !== 1 ? "s" : ""} until{" "}
                        {loyaltyHint.milestoneDiscountPct ?? 15}% off (every {loyaltyHint.everyN ?? 5}).
                      </>
                    ) : (
                      <>
                        Te faltan {loyaltyHint.bookingsUntil} reserva{loyaltyHint.bookingsUntil !== 1 ? "s" : ""} pagada
                        {loyaltyHint.bookingsUntil !== 1 ? "s" : ""} para el {loyaltyHint.milestoneDiscountPct ?? 15}% (cada{" "}
                        {loyaltyHint.everyN ?? 5}).
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

          {checkoutMode === "full_connect" && booking.fullConnectPreview ? (
            <div className="bg-[#F4F0EB] rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-[#1C1917]">
                {listingLang === "en" ? "Checkout total (Stripe)" : "Total en Stripe"}
              </p>
              <div className="text-xs text-[#374151] space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-[#6B7280]">{listingLang === "en" ? "Service" : "Servicio"}</span>
                  <span className="font-tabular-nums">{formatMXN(booking.fullConnectPreview.subtotalCents)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#6B7280]">
                    {listingLang === "en" ? "Platform fee" : "Tarifa plataforma"} ({booking.commissionPct}%)
                  </span>
                  <span className="font-tabular-nums">{formatMXN(booking.fullConnectPreview.commissionCents)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#6B7280]">
                    IVA ({booking.fullConnectPreview.vatPercent}%)
                  </span>
                  <span className="font-tabular-nums">{formatMXN(booking.fullConnectPreview.vatCents)}</span>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-[#E5E0D8] font-bold text-[#1C1917]">
                  <span>{listingLang === "en" ? "You pay" : "Pagas"}</span>
                  <span className="font-tabular-nums text-base">{formatMXN(booking.fullConnectPreview.totalCents)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#F4F0EB] rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280]">
                  {listingLang === "en" ? "Platform fee" : "Tarifa"}{" "}
                  {isService ? (listingLang === "en" ? "(service)" : "de servicio") : listingLang === "en" ? "(connection)" : "de conexión"}{" "}
                  ({booking.commissionPct}%)
                </p>
                <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                  {booking.commissionBeforeLoyaltyCents != null &&
                    booking.commissionBeforeLoyaltyCents > booking.commissionAmountCents && (
                      <p className="text-sm text-[#9CA3AF] line-through decoration-[#9CA3AF]">
                        {formatMXN(booking.commissionBeforeLoyaltyCents)}
                      </p>
                    )}
                  <p className="text-lg font-bold text-[#1C1917]">{formatMXN(booking.commissionAmountCents)}</p>
                </div>
                {booking.loyaltyDiscountCents != null && booking.loyaltyDiscountCents > 0 && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    {listingLang === "en"
                      ? `You save ${formatMXN(booking.loyaltyDiscountCents)} on the fee.`
                      : `Ahorras ${formatMXN(booking.loyaltyDiscountCents)} en la tarifa.`}
                  </p>
                )}
              </div>
              <span className="text-xs text-[#6B7280] shrink-0">MXN</span>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void startCheckout()}
            className="w-full py-3 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy
              ? listingLang === "en"
                ? "Processing…"
                : "Procesando…"
              : checkoutMode === "full_connect" && booking.fullConnectPreview
                ? listingLang === "en"
                  ? `Pay ${formatMXN(booking.fullConnectPreview.totalCents)} (full checkout)`
                  : `Pagar ${formatMXN(booking.fullConnectPreview.totalCents)} (total)`
                : isService
                  ? listingLang === "en"
                    ? requiresQuote
                      ? `Pay deposit ${formatMXN(booking.commissionAmountCents)}`
                      : `Pay ${formatMXN(booking.commissionAmountCents)}`
                    : requiresQuote
                      ? `Pagar depósito ${formatMXN(booking.commissionAmountCents)}`
                      : `Pagar ${formatMXN(booking.commissionAmountCents)}`
                  : listingLang === "en"
                    ? `Pay ${formatMXN(booking.commissionAmountCents)} and open WhatsApp`
                    : `Pagar ${formatMXN(booking.commissionAmountCents)} y abrir WhatsApp`}
          </button>

          <p className="text-center text-xs text-[#6B7280]">
            {isService
              ? listingLang === "en"
                ? "Secure checkout with Stripe."
                : "Pago seguro con Stripe."
              : listingLang === "en"
                ? "Secure payment with Stripe. After paying you can open the seller’s WhatsApp from here."
                : `Pago seguro con Stripe. Al pagar podrás abrir el WhatsApp del ${partyLabel} desde aquí.`}
          </p>

          {loyaltyHint && loyaltyHint.discountPct > 0 && booking.commissionBeforeLoyaltyCents == null && (
            <div className="bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] rounded-xl p-3 text-center space-y-1">
              {loyaltyHint.milestoneDiscount && loyaltyHint.bookingsUntil === 0 ? (
                <p className="text-xs font-semibold text-white">
                  🎉{" "}
                  {listingLang === "en"
                    ? `This booking includes ${loyaltyHint.discountPct}% off the fee (loyalty milestone).`
                    : `¡Esta reserva incluye ${loyaltyHint.discountPct}% de descuento en la tarifa (lealtad)!`}
                </p>
              ) : loyaltyHint.rebookDiscount ? (
                <p className="text-xs font-semibold text-white">
                  ⭐{" "}
                  {listingLang === "en"
                    ? `${loyaltyHint.discountPct}% off for booking again on Naranjogo (app only). Final amount is confirmed at checkout.`
                    : `${loyaltyHint.discountPct}% de descuento por volver a reservar en Naranjogo (solo en la app). El monto final se confirma al pagar.`}
                </p>
              ) : (
                <p className="text-xs font-semibold text-white">
                  🎉{" "}
                  {listingLang === "en"
                    ? `This booking has ${loyaltyHint.discountPct}% off the fee.`
                    : `¡Esta reserva tiene ${loyaltyHint.discountPct}% de descuento!`}
                </p>
              )}
              {!loyaltyHint.milestoneDiscount && (
                <p className="text-[10px] text-white/85 leading-snug">
                  {listingLang === "en" ? (
                    <>
                      {loyaltyHint.bookingsUntil} more paid booking
                      {loyaltyHint.bookingsUntil !== 1 ? "s" : ""} until {loyaltyHint.milestoneDiscountPct ?? 15}% (every{" "}
                      {loyaltyHint.everyN ?? 5}).
                    </>
                  ) : (
                    <>
                      A {loyaltyHint.bookingsUntil} reserva{loyaltyHint.bookingsUntil !== 1 ? "s" : ""} del bonus{" "}
                      {loyaltyHint.milestoneDiscountPct ?? 15}% (cada {loyaltyHint.everyN ?? 5} reservas pagadas).
                    </>
                  )}
                </p>
              )}
            </div>
          )}
          {loyaltyHint && loyaltyHint.discountPct === 0 && loyaltyHint.bookingsUntil > 0 && (
            <div className="bg-gradient-to-r from-[#1B4332]/90 to-[#2D6A4F]/90 rounded-xl p-3 text-center">
              <p className="text-xs text-white/90">
                ⭐{" "}
                {listingLang === "en" ? (
                  <>
                    {loyaltyHint.bookingsUntil} more paid booking{loyaltyHint.bookingsUntil !== 1 ? "s" : ""} until{" "}
                    {loyaltyHint.milestoneDiscountPct ?? 15}% off the fee.
                  </>
                ) : (
                  <>
                    {loyaltyHint.bookingsUntil} reserva{loyaltyHint.bookingsUntil !== 1 ? "s" : ""} más para{" "}
                    {loyaltyHint.milestoneDiscountPct ?? 15}% en la tarifa (lealtad).
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p className={`px-4 pb-3 text-xs ${msg.includes("Error") || msg.includes("Primero") ? "text-red-600" : "text-emerald-700"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
