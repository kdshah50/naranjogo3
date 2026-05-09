"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";

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
};

function formatMXN(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
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
  liveAvailability,
  loginReturnTo,
}: {
  listingId: string;
  isService: boolean;
  sellerId: string | null;
  /** From listing page `?lang=` — affects booking note copy only. */
  listingLang?: Lang;
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

  const load = useCallback(async () => {
    setMsg("");
    const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (meRes.ok) {
      const j = await meRes.json();
      setMeId(j.user?.id ?? null);
    } else {
      setMeId(null);
    }

    const res = await fetch(`/api/listings/${listingId}/service-booking`, { credentials: "same-origin" });
    const data = res.ok ? await res.json() : null;
    setBooking(data as BookingState | null);
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
    return () => {
      window.removeEventListener("tianguis:listing-contact", onContact);
      window.removeEventListener("tianguis:booking-paid", onPaid);
      window.removeEventListener("tianguis:booking-lifecycle", onLifecycle);
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
   * Listing trust/stats are server-rendered; this block is client-only. Buyers do not receive
   * `tianguis:booking-lifecycle` (seller dashboard fires it). Poll while a paid booking still
   * blocks checkout or a Stripe session is pending so seller status updates unblock rebook / UI.
   */
  useEffect(() => {
    if (!booking?.flowActive) return;
    const shouldPoll = Boolean(booking.checkoutBlocked || booking.hasPendingBooking);
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [load, booking?.flowActive, booking?.checkoutBlocked, booking?.hasPendingBooking]);

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
        body: JSON.stringify({ listingId, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : "";
        const err = (data as { error?: string }).error ?? "Error al crear pago";
        throw new Error(detail ? `${err} ${detail}` : err);
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

      {/* STEP 2: Contacted, ready to pay */}
      {contacted && !hasPaid && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800">
              <strong>{listingLang === "en" ? "Step 2:" : "Paso 2:"}</strong>{" "}
              {isService
                ? listingLang === "en"
                  ? "Pay the service fee below to continue."
                  : "Paga la tarifa de servicio abajo para continuar."
                : listingLang === "en"
                  ? "Pay the connection fee to open the seller’s WhatsApp."
                  : "Paga la tarifa de conexión para recibir el WhatsApp del vendedor."}
            </p>
          </div>

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
              : isService
                ? listingLang === "en"
                  ? `Pay ${formatMXN(booking.commissionAmountCents)}`
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
