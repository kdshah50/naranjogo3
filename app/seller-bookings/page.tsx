"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import type { Lang } from "@/lib/i18n-lang";

type SellerBooking = {
  id: string;
  listing_id: string;
  buyer_id: string;
  commission_amount_cents: number;
  payment_status: string;
  status: string;
  paid_at: string | null;
  ticket_code: string | null;
  package_session_count?: number | null;
  listing_title: string;
  buyer_name: string;
  has_review?: boolean;
};

function phaseLabel(status: string, lang: Lang): { label: string; cls: string } {
  const es = lang === "es";
  switch (status) {
    case "confirmed":
      return { label: es ? "Pagado — pendiente agendar" : "Paid — scheduling pending", cls: "bg-blue-50 text-blue-800" };
    case "scheduled":
      return { label: es ? "Agendado" : "Scheduled", cls: "bg-indigo-50 text-indigo-800" };
    case "in_progress":
      return { label: es ? "En curso" : "In progress", cls: "bg-amber-50 text-amber-900" };
    case "completed":
      return { label: es ? "Completado" : "Completed", cls: "bg-emerald-100 text-emerald-800" };
    case "cancelled":
      return { label: es ? "Cancelada" : "Cancelled", cls: "bg-red-50 text-red-800" };
    default:
      return { label: status, cls: "bg-[#F4F0EB] text-[#6B7280]" };
  }
}

function waReasonDetail(reason: string | undefined, es: boolean): string {
  switch (reason) {
    case "no_buyer_phone":
      return es ? "sin teléfono en la cuenta del comprador" : "no phone on buyer account";
    case "twilio_unconfigured":
      return es ? "WhatsApp no configurado (TWILIO_* en servidor)" : "WhatsApp not configured (TWILIO_* on server)";
    case "send_failed":
      return es ? "error de envío (Twilio / red)" : "send error (Twilio / network)";
    case "not_paid":
      return es ? "reserva no pagada" : "booking not paid";
    case "no_booking":
      return es ? "reserva no encontrada" : "booking not found";
    default:
      return es ? "motivo desconocido" : "unknown reason";
  }
}

function SellerBookingsInner() {
  const lang = useAppLang();
  const es = lang === "es";
  const t = {
    profile: es ? "← Mi perfil" : "← My profile",
    title: es ? "Reservas de clientes" : "Client bookings",
    lead: es
      ? "Cada pago genera un ticket NG-… (mismo que en el WhatsApp de confirmación). La lista se actualiza sola cada pocos segundos con esta pantalla abierta; también puedes usar «Actualizar lista»."
      : "Each payment has an NG-… ticket (same as your payment WhatsApp). The list auto-refreshes every few seconds while this screen is open; you can also use ‘Refresh list’.",
    ticketMatchesWa: es
      ? "Mismo código que en WhatsApp («Pago recibido», Naranjogo)."
      : "Same code as in WhatsApp (“Payment received”, Naranjogo).",
    ticketPending: es
      ? "Si acaba de pagar, el ticket puede tardar unos segundos. Pulsa «Actualizar lista» arriba."
      : "If they just paid, the ticket may take a few seconds. Use ‘Refresh list’ above.",
    refreshList: es ? "Actualizar lista" : "Refresh list",
    viewListing: es ? "Abrir anuncio" : "Open listing",
    planVisits: (n: number) => (es ? `Plan: ${n} visitas` : `${n}-visit plan`),
    strikeIntro: es ? "Ranking / garantía:" : "Ranking / guarantee:",
    strikeOne: es
      ? "marca por no-show verificada (reclamo aprobado)."
      : "verified no-show strike (approved claim).",
    strikeMany: es
      ? "marcas por no-show verificadas (reclamos aprobados)."
      : "verified no-show strikes (approved claims).",
    strikeFoot:
      es
        ? "La búsqueda ya penaliza cancelaciones; las marcas cuentan para disputas y revisión manual del equipo."
        : "Search already penalizes cancellations; strikes count toward disputes and manual team review.",
    empty: es ? "Aún no hay reservas pagadas." : "No paid bookings yet.",
    buyer: es ? "Cliente" : "Buyer",
    ref: es ? "ref" : "ref",
    fee: es ? "Tarifa plataforma" : "Platform fee",
    btnScheduled: es ? "1 · Marcar como agendado" : "1 · Mark scheduled",
    btnInProgressFull: es ? "Saltar a · Servicio en curso" : "Skip to · In progress",
    btnInProgressStep: es ? "2 · Servicio en curso" : "2 · In progress",
    btnComplete: es ? "Marcar como completado" : "Mark completed",
    cancelSummary: es ? "Cancelar reserva / cliente no se presentó" : "Cancel booking / buyer no-show",
    cancelHelp:
      es
        ? "Registra el motivo; queda en auditoría. No hay reembolso automático — la garantía y soporte revisan caso por caso. Si el cliente no llegó, elige «Cliente no se presentó»."
        : "Record the reason; it stays in the audit trail. No automatic refund — guarantee and support review case by case. If the buyer didn’t show, choose “Buyer no-show”.",
    optMutual: es ? "Acuerdo con el cliente" : "Mutual agreement",
    optSeller: es ? "No puedo atender (proveedor)" : "I can’t serve (provider)",
    optBuyerNs: es ? "Cliente no se presentó" : "Buyer no-show",
    optOther: es ? "Otro" : "Other",
    confirmCancel: es ? "Confirmar cancelación" : "Confirm cancellation",
    reviewed: es ? "★ Cliente ya envió reseña" : "★ Buyer submitted a review",
    notifyScheduled:
      es ? "✓ Estado agendado guardado y WhatsApp enviado al cliente." : "✓ Scheduled saved and WhatsApp sent to the buyer.",
    notifyProgress:
      es
        ? "✓ Servicio en curso guardado y WhatsApp enviado al comprador."
        : "✓ In progress saved and WhatsApp sent to the buyer.",
    notifyDeduped:
      es
        ? "✓ Estado guardado. WhatsApp para este paso ya se había enviado antes (sin duplicar)."
        : "✓ Status saved. WhatsApp for this step was already sent (not duplicated).",
    notifyWhatsappNotSent: (detail: string) =>
      es
        ? `⚠️ Estado guardado en la app. WhatsApp al comprador: no enviado (${detail}). Puede ver el avance en «Mis reservas».`
        : `⚠️ Saved in the app. Buyer WhatsApp: not sent (${detail}). They can still see status in My bookings.`,
    notifyCompleteOk:
      es
        ? "✓ Completado guardado y WhatsApp de reseña enviado al comprador."
        : "✓ Completed saved and review WhatsApp sent to the buyer.",
    updated: es ? "✓ Actualizado" : "✓ Updated",
    cancelOk:
      es
        ? "✓ Reserva cancelada; cliente notificado por WhatsApp si hay número."
        : "✓ Booking cancelled; buyer notified on WhatsApp when we have a number.",
    lastSyncPrefix: es ? "Actualizado:" : "Updated:",
  };

  const router = useRouter();
  const [bookings, setBookings] = useState<SellerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [sellerStrikeCount, setSellerStrikeCount] = useState<number | null>(null);
  const [sellerCancelCode, setSellerCancelCode] = useState<Record<string, string>>({});

  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncLabel, setLastSyncLabel] = useState("");
  const [newPaidBanner, setNewPaidBanner] = useState<string | null>(null);
  const [bookingsLoadError, setBookingsLoadError] = useState<string | null>(null);

  const syncCountRef = useRef(0);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const bannerTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings?seller=1&status=paid", { credentials: "same-origin", cache: "no-store" });
    if (res.status === 401) {
      router.push("/auth/login?returnTo=/seller-bookings");
      return;
    }
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        try {
          msg = (await res.text()).slice(0, 200) || msg;
        } catch {
          /* ignore */
        }
      }
      console.error("[seller-bookings] /api/bookings failed", res.status, msg);
      setBookingsLoadError(msg);
      setBookings([]);
      setLoading(false);
      return;
    }
    setBookingsLoadError(null);
    const data = (await res.json()) as { bookings?: SellerBooking[]; sellerStrikeCount?: number };
    const list = Array.isArray(data.bookings) ? data.bookings : [];
    setBookings(list);
    if (typeof data.sellerStrikeCount === "number") setSellerStrikeCount(data.sellerStrikeCount);
    const initCodes: Record<string, string> = {};
    for (const row of list as SellerBooking[]) {
      initCodes[row.id] = "mutual_agreement";
    }
    setSellerCancelCode((prev) => ({ ...initCodes, ...prev }));

    syncCountRef.current += 1;
    const ids = new Set((list as SellerBooking[]).map((b) => b.id));
    if (syncCountRef.current > 1) {
      const added = (list as SellerBooking[]).filter((b) => !prevIdsRef.current.has(b.id));
      if (added.length > 0) {
        const first = added[0];
        const tk = first.ticket_code ? ` (${first.ticket_code})` : "";
        setNewPaidBanner(
          added.length > 1
            ? es
              ? `Nuevas reservas pagadas: ${added.length}`
              : `New paid bookings: ${added.length}`
            : es
              ? `Nueva reserva pagada${tk}`
              : `New paid booking${tk}`
        );
        if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = window.setTimeout(() => {
          setNewPaidBanner(null);
          bannerTimerRef.current = null;
        }, 12_000);
      }
    }
    prevIdsRef.current = ids;

    setLastSyncLabel(
      new Intl.DateTimeFormat(es ? "es-MX" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date())
    );

    setLoading(false);
  }, [router, es]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, [load]);

  const manualRefresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const patchStatus = async (id: string, status: "scheduled" | "in_progress" | "completed") => {
    setBusyId(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        buyerPhaseWhatsApp?: { delivered: boolean; reason?: string };
      };
      if (!res.ok) throw new Error(data.error ?? "Error");

      let feedback: string;
      if (status === "completed") {
        const w = data.buyerPhaseWhatsApp;
        if (w?.delivered === true) {
          feedback = t.notifyCompleteOk;
        } else if (w && w.delivered === false) {
          if (w.reason === "deduped") {
            feedback = t.notifyDeduped;
          } else {
            feedback = t.notifyWhatsappNotSent(waReasonDetail(w.reason, es));
          }
        } else {
          feedback = t.updated;
        }
      } else if (status === "scheduled" || status === "in_progress") {
        const w = data.buyerPhaseWhatsApp;
        if (w?.delivered === true) {
          feedback = status === "scheduled" ? t.notifyScheduled : t.notifyProgress;
        } else if (w && w.delivered === false) {
          if (w.reason === "deduped") {
            feedback = t.notifyDeduped;
          } else {
            feedback = t.notifyWhatsappNotSent(waReasonDetail(w.reason, es));
          }
        } else {
          feedback = t.updated;
        }
      } else {
        feedback = t.updated;
      }

      setMsg((m) => ({ ...m, [id]: feedback }));
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status === "completed" ? "completed" : status } : b))
      );
      const listingIdForEvent = bookings.find((b) => b.id === id)?.listing_id;
      if (listingIdForEvent && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tianguis:booking-lifecycle", { detail: { listingId: listingIdForEvent } })
        );
      }
      void load();
    } catch (e) {
      setMsg((m) => ({
        ...m,
        [id]: e instanceof Error ? e.message : "Error",
      }));
    } finally {
      setBusyId(null);
    }
  };

  const patchCancel = async (id: string) => {
    const cancelReasonCode = sellerCancelCode[id] ?? "mutual_agreement";
    setBusyId(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", cancelReasonCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      setMsg((m) => ({ ...m, [id]: t.cancelOk }));
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
    } catch (e) {
      setMsg((m) => ({
        ...m,
        [id]: e instanceof Error ? e.message : "Error",
      }));
    } finally {
      setBusyId(null);
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
      <div className="max-w-lg mx-auto">
        <Link href="/profile" className="text-sm text-[#6B7280] hover:text-[#1B4332] mb-4 inline-block">
          {t.profile}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h1 className="font-serif text-2xl font-bold text-[#1C1917]">{t.title}</h1>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void manualRefresh()}
              disabled={refreshing || loading}
              className="px-3 py-1.5 rounded-xl border border-[#1B4332] text-[#1B4332] text-xs font-semibold hover:bg-[#ECFDF5] disabled:opacity-40"
            >
              {refreshing ? "…" : t.refreshList}
            </button>
            {lastSyncLabel && (
              <span className="text-[10px] text-[#9CA3AF] tabular-nums">
                {t.lastSyncPrefix} {lastSyncLabel}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-[#6B7280] mb-6">{t.lead}</p>

        {bookingsLoadError && (
          <div
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {es ? "No se pudo cargar la lista de reservas." : "Could not load the bookings list."}{" "}
            <span className="font-mono text-xs opacity-90">{bookingsLoadError}</span>
          </div>
        )}

        {sellerStrikeCount !== null && sellerStrikeCount > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <strong>{t.strikeIntro}</strong> <strong>{sellerStrikeCount}</strong>{" "}
            {sellerStrikeCount === 1 ? t.strikeOne : t.strikeMany} {t.strikeFoot}
          </div>
        )}

        {newPaidBanner && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950">
            {newPaidBanner}
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center text-sm text-[#6B7280]">{t.empty}</div>
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => {
              const ph = phaseLabel(b.status, lang);
              const disabled = busyId === b.id;
              return (
                <li key={b.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1C1917]">{b.listing_title}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        {t.buyer}: {b.buyer_name}
                      </p>
                      {b.package_session_count != null && b.package_session_count >= 2 && (
                        <p className="text-[11px] text-[#57534E] font-medium mt-0.5">{t.planVisits(b.package_session_count)}</p>
                      )}
                      <div className="mt-2 rounded-lg border border-[#E5E0D8] bg-[#FAFAF9] px-2.5 py-2">
                        {b.ticket_code ? (
                          <>
                            <p className="text-sm font-mono font-bold text-[#1B4332] tracking-tight">🎫 {b.ticket_code}</p>
                            <p className="text-[10px] text-[#6B7280] mt-1 leading-snug">{t.ticketMatchesWa}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[10px] font-mono text-[#9CA3AF]">
                              {t.ref} {b.id.slice(0, 8)}…
                            </p>
                            <p className="text-[10px] text-amber-900 mt-1 leading-snug">{t.ticketPending}</p>
                          </>
                        )}
                      </div>
                      <Link
                        href={`/listing/${b.listing_id}`}
                        className="inline-block mt-2 text-xs font-semibold text-[#1B4332] hover:underline"
                      >
                        {t.viewListing} →
                      </Link>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${ph.cls}`}>
                      {ph.label}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mb-3">
                    {t.fee}: {formatCurrencyMXN(b.commission_amount_cents, lang)}
                  </p>

                  {b.status !== "completed" && b.status !== "cancelled" && (
                    <div className="flex flex-col gap-2">
                      {(b.status === "confirmed" || b.status === "pending") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "scheduled")}
                          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {t.btnScheduled}
                        </button>
                      )}
                      {(b.status === "confirmed" || b.status === "scheduled") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "in_progress")}
                          className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {b.status === "confirmed" ? t.btnInProgressFull : t.btnInProgressStep}
                        </button>
                      )}
                      {(b.status === "confirmed" || b.status === "scheduled" || b.status === "in_progress") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "completed")}
                          className="w-full py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {t.btnComplete}
                        </button>
                      )}
                      <details className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF9] px-3 py-2 mt-1">
                        <summary className="text-xs font-semibold text-[#57534E] cursor-pointer list-none">{t.cancelSummary}</summary>
                        <p className="text-[10px] text-[#6B7280] mt-2 leading-relaxed">{t.cancelHelp}</p>
                        <select
                          value={sellerCancelCode[b.id] ?? "mutual_agreement"}
                          onChange={(e) =>
                            setSellerCancelCode((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          className="mt-2 w-full border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="mutual_agreement">{t.optMutual}</option>
                          <option value="seller_unavailable">{t.optSeller}</option>
                          <option value="buyer_no_show">{t.optBuyerNs}</option>
                          <option value="other">{t.optOther}</option>
                        </select>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchCancel(b.id)}
                          className="w-full mt-2 py-2 rounded-xl border border-red-300 text-red-800 text-xs font-semibold bg-white hover:bg-red-50 disabled:opacity-50"
                        >
                          {t.confirmCancel}
                        </button>
                      </details>
                    </div>
                  )}

                  {b.status === "completed" && b.has_review && <p className="text-xs text-amber-700 font-semibold mt-2">{t.reviewed}</p>}

                  {msg[b.id] && (
                    <p
                      className={`text-xs mt-2 ${
                        msg[b.id].startsWith("⚠️")
                          ? "text-amber-800"
                          : msg[b.id].startsWith("✓")
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {msg[b.id]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function SellerBookingsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <SellerBookingsInner />
    </Suspense>
  );
}
