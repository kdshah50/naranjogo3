"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GuaranteeBadge from "@/components/GuaranteeBadge";
import RoutineHabitsCard from "@/components/RoutineHabitsCard";
import BuyerRetentionPanel from "@/components/BuyerRetentionPanel";
import { useAppLang, useAppLangActions } from "@/hooks/use-app-lang";

type Booking = {
  id: string;
  listing_id: string;
  seller_id: string;
  commission_amount_cents: number;
  payment_status: string;
  paid_at: string | null;
  status: string;
  ticket_code?: string | null;
  created_at: string;
  has_review?: boolean;
  package_session_count?: number | null;
  cancel_reason_code?: string | null;
  listing_title: string;
  seller_name: string;
};

type ReminderRow = {
  id: string;
  booking_id: string;
  reminder_kind: string;
  status: string;
  remind_at: string;
  notify_whatsapp?: boolean | null;
  notify_email?: boolean | null;
  delivery_email?: string | null;
  listing_title?: string | null;
};

function formatMXN(cents: number, lang: "es" | "en") {
  return new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function timeAgo(dateStr: string, lang: "es" | "en"): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (lang === "en") {
    if (days < 1) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return "1 month ago";
    if (months < 12) return `${months} months ago`;
    return "Over a year ago";
  }
  if (days < 1) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Hace 1 mes";
  if (months < 12) return `Hace ${months} meses`;
  return `Hace más de 1 año`;
}

function ReviewBlock({
  booking,
  lang,
  onDone,
}: {
  booking: Booking;
  lang: "es" | "en";
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const t =
    lang === "es"
      ? {
          title: "Valorar servicio",
          placeholder: "Comentario opcional",
          submit: "Enviar reseña",
        }
      : {
          title: "Rate this service",
          placeholder: "Optional comment",
          submit: "Submit review",
        };

  const submit = async () => {
    if (rating < 1 || rating > 5) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-[#E5E0D8]">
      <p className="text-xs font-semibold text-[#1C1917] mb-2">{t.title}</p>
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="text-2xl leading-none text-amber-500 hover:scale-110 transition-transform"
            aria-label={`${n} stars`}
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t.placeholder}
        className="w-full text-xs border border-[#E5E0D8] rounded-xl px-3 py-2 mb-2 outline-none focus:border-[#1B4332]"
        rows={2}
        maxLength={1000}
      />
      {err && <p className="text-xs text-red-600 mb-1">{err}</p>}
      <button
        type="button"
        disabled={submitting || rating < 1}
        onClick={() => void submit()}
        className="w-full py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold disabled:opacity-40"
      >
        {submitting ? "…" : t.submit}
      </button>
    </div>
  );
}

const REBOOK_OPTIONS = [7, 14, 30, 90, 180] as const;
const BEFORE_OPTIONS = [1, 6, 24, 48, 72] as const;

export default function MyBookingsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <MyBookingsPageInner />
    </Suspense>
  );
}

function MyBookingsPageInner() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderMsg, setReminderMsg] = useState<Record<string, string>>({});
  const [rebookDays, setRebookDays] = useState<Record<string, number>>({});
  const [waOn, setWaOn] = useState<Record<string, boolean>>({});
  const [emailOn, setEmailOn] = useState<Record<string, boolean>>({});
  const [emailVal, setEmailVal] = useState<Record<string, string>>({});
  const [apptLocal, setApptLocal] = useState<Record<string, string>>({});
  const [apptBeforeH, setApptBeforeH] = useState<Record<string, number>>({});
  const lang = useAppLang();
  const { setLang } = useAppLangActions();
  const [busyCancelId, setBusyCancelId] = useState<string | null>(null);
  const [buyerCancelCode, setBuyerCancelCode] = useState<Record<string, string>>({});
  const [cancelMsg, setCancelMsg] = useState<Record<string, string>>({});
  const [bookingsLoadError, setBookingsLoadError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      fetch("/api/bookings?status=paid", {
        credentials: "same-origin",
        cache: "no-store",
      }).then(async (r) => {
        if (r.status === 401) {
          router.push("/auth/login?returnTo=/my-bookings");
          return { bookings: [], _loadError: null };
        }
        if (!r.ok) {
          let msg = `${r.status}`;
          try {
            const j = (await r.json()) as { error?: string };
            if (j?.error) msg = j.error;
          } catch {
            try {
              msg = (await r.text()).slice(0, 200) || msg;
            } catch {
              /* ignore */
            }
          }
          console.error("[my-bookings] /api/bookings failed", r.status, msg);
          return { bookings: [], _loadError: msg };
        }
        const j = (await r.json()) as { bookings?: Booking[] };
        return {
          bookings: Array.isArray(j.bookings) ? j.bookings : [],
          _loadError: null,
        };
      }),
      fetch("/api/reminders", { credentials: "same-origin", cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { reminders: [] },
      ),
    ])
      .then(([bData, rData]) => {
        setBookingsLoadError(bData._loadError ?? null);
        const list = bData.bookings;
        setBookings(list);
        const initCancel: Record<string, string> = {};
        for (const x of list as Booking[]) {
          initCancel[x.id] = "changed_mind";
        }
        setBuyerCancelCode((prev) => ({ ...initCancel, ...prev }));
        setReminders(Array.isArray(rData.reminders) ? rData.reminders : []);
        const initDays: Record<string, number> = {};
        const initWa: Record<string, boolean> = {};
        for (const x of list as Booking[]) {
          initDays[x.id] = 30;
          initWa[x.id] = true;
        }
        setRebookDays((prev) => ({ ...initDays, ...prev }));
        setWaOn((prev) => ({ ...initWa, ...prev }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onLifecycle = () => void loadData();
    window.addEventListener("tianguis:booking-lifecycle", onLifecycle);
    return () => window.removeEventListener("tianguis:booking-lifecycle", onLifecycle);
  }, [loadData]);

  useEffect(() => {
    const onPaid = () => loadData();
    window.addEventListener("tianguis:booking-paid", onPaid);
    return () => window.removeEventListener("tianguis:booking-paid", onPaid);
  }, [loadData]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") loadData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadData]);

  /** Provider lifecycle updates booking server-side — poll so buyers see status without manual refresh. */
  useEffect(() => {
    const hasLifecycleActive = bookings.some((b) => !["completed", "cancelled"].includes(String(b.status ?? "")));
    if (loading || !hasLifecycleActive) return;
    const interval = window.setInterval(() => loadData(), 30_000);
    return () => clearInterval(interval);
  }, [loading, bookings, loadData]);

  useEffect(() => {
    if (loading || bookings.length === 0) return;
    const reviewId =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("review") : null;
    if (!reviewId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`booking-${reviewId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [loading, bookings]);

  const t =
    lang === "es"
      ? {
          back: "← Mi perfil",
          title: "Mis reservas",
          subtitle: "Historial de servicios, reseñas y recordatorios. Vuelve a reservar en un clic.",
          emptyTitle: "Aún no tienes reservas completadas.",
          explore: "Explorar servicios →",
          rebook: "Volver a reservar →",
          remindSection: "Recordatorios",
          remindBlurb:
            "Te avisamos por WhatsApp el día que elijas. Para servicios recurrentes (limpieza, mascotas, jardín), muchos eligen 30 días.",
          quickPreset: "Frecuente:",
          quick30: "30 días",
          quick90: "90 días",
          rebookLabel: "Volver a reservar en",
          days: "días",
          saveRebook: "Guardar recordatorio",
          wa: "WhatsApp",
          em: "Correo",
          emPh: "tu@correo.com",
          apptTitle: "Próxima cita (opcional)",
          apptWhen: "Fecha y hora",
          apptBefore: "Avisar antes",
          hours: "h",
          saveAppt: "Guardar aviso de cita",
          apptDisclaimer:
            "Este recordatorio es solo para ti: confirma con el proveedor por WhatsApp que la fecha y hora le funcionan. Naranjogo no reserva la agenda del proveedor.",
          pendingRebook: "Pendiente: volver a reservar",
          pendingAppt: "Pendiente: cita",
          cancelRem: "Cancelar",
          reviewed: "Reseña enviada",
          reviewPending:
            "El proveedor debe marcar el servicio como completado antes de valorar. Te enviaremos un WhatsApp con el enlace.",
          phaseConfirmed: "Pagado",
          phaseScheduled: "Agendado",
          phaseInProgress: "En curso",
          phaseCompleted: "Completado",
          phaseCancelled: "Cancelada",
          guaranteeLink: "Garantía / no-show",
          cancelBooking: "Cancelar reserva",
          cancelHint:
            "Solo antes de que el proveedor marque “en curso”. No hay reembolso automático de la comisión; el equipo revisa caso por caso con la garantía.",
          cancelReason: "Motivo",
          cancelDo: "Confirmar cancelación",
          cancelReasonSchedule: "Conflicto de agenda",
          cancelReasonMind: "Cambié de opinión",
          cancelReasonOtherProv: "Contraté a otro proveedor",
          cancelReasonOther: "Otro",
          cancelledBlurb:
            "Reserva cancelada. Si hubo incumplimiento del proveedor, abre un reclamo en garantía (conserva tus mensajes como evidencia).",
        }
      : {
          back: "← My profile",
          title: "My bookings",
          subtitle: "Service history, reviews, and reminders. Rebook in one tap.",
          emptyTitle: "You don’t have completed bookings yet.",
          explore: "Browse services →",
          rebook: "Book again →",
          remindSection: "Reminders",
          remindBlurb:
            "We’ll nudge you on WhatsApp on the date you pick. For recurring services (cleaning, pets, yard work), 30 days is a common rhythm.",
          quickPreset: "Popular:",
          quick30: "30 days",
          quick90: "90 days",
          rebookLabel: "Remind me to rebook in",
          days: "days",
          saveRebook: "Save reminder",
          wa: "WhatsApp",
          em: "Email",
          emPh: "you@email.com",
          apptTitle: "Next appointment (optional)",
          apptWhen: "Date & time",
          apptBefore: "Notify me before",
          hours: "h",
          saveAppt: "Save appointment nudge",
          apptDisclaimer:
            "This nudge is for you only: confirm with the provider on WhatsApp that the date and time work for them. Naranjogo does not hold their calendar.",
          pendingRebook: "Scheduled: rebook nudge",
          pendingAppt: "Scheduled: appointment",
          cancelRem: "Cancel",
          reviewed: "Review submitted",
          reviewPending:
            "The provider must mark the job completed before you can rate them. We’ll WhatsApp you a link when they do.",
          phaseConfirmed: "Paid",
          phaseScheduled: "Scheduled",
          phaseInProgress: "In progress",
          phaseCompleted: "Completed",
          phaseCancelled: "Cancelled",
          guaranteeLink: "Guarantee / no-show",
          cancelBooking: "Cancel booking",
          cancelHint:
            "Only before the provider marks the visit “in progress.” Platform fees are not refunded automatically; support reviews disputes via the guarantee.",
          cancelReason: "Reason",
          cancelDo: "Confirm cancellation",
          cancelReasonSchedule: "Schedule conflict",
          cancelReasonMind: "Changed my mind",
          cancelReasonOtherProv: "Booked another provider",
          cancelReasonOther: "Other",
          cancelledBlurb:
            "This booking was cancelled. If the provider failed to show up or broke commitments, file a guarantee claim (keep WhatsApp messages as evidence).",
        };

  const pendingFor = (bookingId: string) =>
    reminders.filter((r) => r.booking_id === bookingId && r.status === "pending");

  const canBuyerCancel = (b: Booking) =>
    b.payment_status === "paid" && ["pending", "confirmed", "scheduled"].includes(b.status);

  const cancelBuyerBooking = async (bookingId: string) => {
    const code = buyerCancelCode[bookingId] ?? "changed_mind";
    setBusyCancelId(bookingId);
    setCancelMsg((m) => ({ ...m, [bookingId]: "" }));
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled", cancelReasonCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      setBookings((prev) =>
        prev.map((x) => (x.id === bookingId ? { ...x, status: "cancelled", cancel_reason_code: code } : x)),
      );
      setCancelMsg((m) => ({
        ...m,
        [bookingId]: lang === "es" ? "✓ Reserva cancelada" : "✓ Booking cancelled",
      }));
    } catch (e) {
      setCancelMsg((m) => ({
        ...m,
        [bookingId]: e instanceof Error ? e.message : "Error",
      }));
    } finally {
      setBusyCancelId(null);
    }
  };

  const cancelReminder = async (reminderId: string, bookingId: string) => {
    try {
      const res = await fetch("/api/reminders", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reminderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      setReminderMsg((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
    } catch (e: unknown) {
      setReminderMsg((prev) => ({
        ...prev,
        [bookingId]: e instanceof Error ? e.message : "Error",
      }));
    }
  };

  const scheduleRebook = async (booking: Booking) => {
    const days = rebookDays[booking.id] ?? 30;
    const notifyWhatsapp = waOn[booking.id] !== false;
    const notifyEmail = emailOn[booking.id] === true;
    const deliveryEmail = (emailVal[booking.id] ?? "").trim();
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          kind: "rebook",
          rebookInDays: days,
          notifyWhatsapp,
          notifyEmail,
          deliveryEmail: notifyEmail ? deliveryEmail : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setReminderMsg((prev) => ({
        ...prev,
        [booking.id]:
          lang === "es"
            ? `✓ Recordatorio en ${days} días (${notifyWhatsapp ? "WhatsApp" : ""}${notifyWhatsapp && notifyEmail ? " + " : ""}${notifyEmail ? "correo" : ""})`
            : `✓ Reminder in ${days} days`,
      }));
      const rRes = await fetch("/api/reminders", { credentials: "same-origin" });
      const rJson = rRes.ok ? await rRes.json() : { reminders: [] };
      setReminders(Array.isArray(rJson.reminders) ? rJson.reminders : []);
    } catch (e: unknown) {
      setReminderMsg((prev) => ({
        ...prev,
        [booking.id]: e instanceof Error ? e.message : "Error",
      }));
    }
  };

  const scheduleAppointment = async (booking: Booking) => {
    const local = apptLocal[booking.id]?.trim();
    if (!local) {
      setReminderMsg((prev) => ({
        ...prev,
        [booking.id]: lang === "es" ? "Elige fecha y hora" : "Pick date & time",
      }));
      return;
    }
    const iso = new Date(local).toISOString();
    const beforeH = apptBeforeH[booking.id] ?? 24;
    const notifyWhatsapp = waOn[booking.id] !== false;
    const notifyEmail = emailOn[booking.id] === true;
    const deliveryEmail = (emailVal[booking.id] ?? "").trim();
    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          kind: "appointment",
          appointmentAt: iso,
          remindBeforeHours: beforeH,
          notifyWhatsapp,
          notifyEmail,
          deliveryEmail: notifyEmail ? deliveryEmail : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      setReminderMsg((prev) => ({
        ...prev,
        [booking.id]: lang === "es" ? "✓ Aviso de cita guardado" : "✓ Appointment reminder saved",
      }));
      const rRes = await fetch("/api/reminders", { credentials: "same-origin" });
      const rJson = rRes.ok ? await rRes.json() : { reminders: [] };
      setReminders(Array.isArray(rJson.reminders) ? rJson.reminders : []);
    } catch (e: unknown) {
      setReminderMsg((prev) => ({
        ...prev,
        [booking.id]: e instanceof Error ? e.message : "Error",
      }));
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
        <div className="flex items-center justify-between mb-4">
          <Link href="/profile" className="text-sm text-[#6B7280] hover:text-[#1B4332] transition-colors">
            {t.back}
          </Link>
          <div className="flex bg-[#F4F0EB] rounded-lg p-1 gap-1">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setLang(l);
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  lang === l ? "bg-white text-[#1B4332] shadow-sm" : "text-[#6B7280]"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <h1 className="font-serif text-2xl font-bold text-[#1B4332] mt-0 mb-2">{t.title}</h1>
        <p className="text-sm text-[#6B7280] mb-4">{t.subtitle}</p>

        {bookingsLoadError && (
          <div
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {lang === "es" ? "No se pudo cargar la lista de reservas." : "Could not load your bookings list."}{" "}
            <span className="font-mono text-xs opacity-90">{bookingsLoadError}</span>
          </div>
        )}

        <div className="mb-6">
          <BuyerRetentionPanel variant="banner" lang={lang} />
          <RoutineHabitsCard lang={lang} />
        </div>

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm text-[#6B7280] mb-4">{t.emptyTitle}</p>
            <Link
              href="/"
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-colors"
            >
              {t.explore}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((b) => {
              const ago = timeAgo(b.paid_at ?? b.created_at, lang);
              return (
                <div key={b.id} id={`booking-${b.id}`} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1C1917]">{b.listing_title}</h3>
                      {b.package_session_count != null && b.package_session_count >= 2 && (
                        <p className="text-xs text-amber-800 font-medium mt-0.5">
                          📦 {lang === "es" ? "Paquete" : "Package"}: {b.package_session_count}{" "}
                          {lang === "es" ? "sesiones" : "sessions"}
                        </p>
                      )}
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        {lang === "es" ? "Proveedor" : "Provider"}: {b.seller_name}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2 items-center">
                        {b.ticket_code && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#ECFDF5] text-[#065F46]">
                            🎫 {b.ticket_code}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F0EB] text-[#374151]">
                          {b.status === "cancelled"
                            ? t.phaseCancelled
                            : b.status === "scheduled"
                              ? t.phaseScheduled
                              : b.status === "in_progress"
                                ? t.phaseInProgress
                                : b.status === "completed"
                                  ? t.phaseCompleted
                                  : t.phaseConfirmed}
                        </span>
                        <Link
                          href={`/claims?booking=${encodeURIComponent(b.id)}`}
                          className="text-[10px] font-semibold text-[#B45309] hover:underline"
                        >
                          {t.guaranteeLink}
                        </Link>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-[#1B4332]">{formatMXN(b.commission_amount_cents, lang)}</p>
                      <p className="text-[10px] text-[#9CA3AF]">{ago}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/listing/${b.listing_id}#booking-section`}
                      className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-[#1B4332] text-white text-xs font-semibold text-center hover:bg-[#2D6A4F] transition-colors"
                    >
                      {t.rebook}
                    </Link>
                  </div>

                  {canBuyerCancel(b) && (
                    <details className="mt-3 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2">
                      <summary className="text-xs font-semibold text-red-900 cursor-pointer list-none">
                        {t.cancelBooking}
                      </summary>
                      <p className="text-[10px] text-red-800/90 mt-2 leading-relaxed">{t.cancelHint}</p>
                      <div className="flex flex-col gap-2 mt-2">
                        <label className="text-[10px] text-[#6B7280]">{t.cancelReason}</label>
                        <select
                          value={buyerCancelCode[b.id] ?? "changed_mind"}
                          onChange={(e) =>
                            setBuyerCancelCode((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          className="border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-xs bg-white text-[#1C1917]"
                        >
                          <option value="schedule_conflict">{t.cancelReasonSchedule}</option>
                          <option value="changed_mind">{t.cancelReasonMind}</option>
                          <option value="found_other_provider">{t.cancelReasonOtherProv}</option>
                          <option value="other">{t.cancelReasonOther}</option>
                        </select>
                        <button
                          type="button"
                          disabled={busyCancelId === b.id}
                          onClick={() => void cancelBuyerBooking(b.id)}
                          className="w-full py-2 rounded-xl bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {busyCancelId === b.id ? "…" : t.cancelDo}
                        </button>
                        {cancelMsg[b.id] && (
                          <p
                            className={`text-[10px] ${cancelMsg[b.id].startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}
                          >
                            {cancelMsg[b.id]}
                          </p>
                        )}
                      </div>
                    </details>
                  )}

                  {pendingFor(b.id).length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {pendingFor(b.id).map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-[#F0FDF4] border border-[#A7F3D0] rounded-lg px-2.5 py-1.5"
                        >
                          <span className="text-[#065F46]">
                            {r.reminder_kind === "appointment" ? t.pendingAppt : t.pendingRebook}:{" "}
                            {new Date(r.remind_at).toLocaleString(lang === "es" ? "es-MX" : "en-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                            {r.notify_whatsapp !== false && " · WhatsApp"}
                            {r.notify_email && " · Email"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void cancelReminder(r.id, b.id)}
                            className="text-amber-800 font-semibold hover:underline"
                          >
                            {t.cancelRem}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-[#E5E0D8]">
                    <p className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wide mb-1">{t.remindSection}</p>
                    <p className="text-[11px] text-[#6B7280] mb-2 leading-relaxed">{t.remindBlurb}</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[#6B7280] text-[11px] shrink-0">{t.quickPreset}</span>
                        <button
                          type="button"
                          onClick={() => setRebookDays((prev) => ({ ...prev, [b.id]: 30 }))}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            (rebookDays[b.id] ?? 30) === 30
                              ? "border-[#1B4332] bg-[#ECFDF5] text-[#065F46]"
                              : "border-[#E5E0D8] bg-white text-[#6B7280] hover:border-[#CCC]"
                          }`}
                        >
                          {t.quick30}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRebookDays((prev) => ({ ...prev, [b.id]: 90 }))}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            rebookDays[b.id] === 90
                              ? "border-[#1B4332] bg-[#ECFDF5] text-[#065F46]"
                              : "border-[#E5E0D8] bg-white text-[#6B7280] hover:border-[#CCC]"
                          }`}
                        >
                          {t.quick90}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[#6B7280] shrink-0">{t.rebookLabel}</label>
                        <select
                          value={rebookDays[b.id] ?? 30}
                          onChange={(e) =>
                            setRebookDays((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))
                          }
                          className="border border-[#E5E0D8] rounded-lg px-2 py-1 text-[#1C1917] bg-white"
                        >
                          {REBOOK_OPTIONS.map((d) => (
                            <option key={d} value={d}>
                              {d} {t.days}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={waOn[b.id] !== false}
                            onChange={(e) => setWaOn((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                          />
                          <span>{t.wa}</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailOn[b.id] === true}
                            onChange={(e) => setEmailOn((prev) => ({ ...prev, [b.id]: e.target.checked }))}
                          />
                          <span>{t.em}</span>
                        </label>
                        {emailOn[b.id] && (
                          <input
                            type="email"
                            placeholder={t.emPh}
                            value={emailVal[b.id] ?? ""}
                            onChange={(e) => setEmailVal((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            className="flex-1 min-w-[140px] border border-[#E5E0D8] rounded-lg px-2 py-1"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void scheduleRebook(b)}
                        className="w-full py-2 rounded-xl bg-[#D4A017] text-white text-xs font-semibold hover:opacity-95"
                      >
                        {t.saveRebook}
                      </button>
                    </div>

                    <details className="mt-3 group">
                      <summary className="text-xs font-semibold text-[#1B4332] cursor-pointer list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                        {t.apptTitle}
                      </summary>
                      <div className="mt-2 space-y-2 pl-1">
                        <p className="text-[10px] text-[#6B7280] leading-snug border-b border-[#E5E0D8] pb-2 mb-1">
                          {t.apptDisclaimer}
                        </p>
                        <div>
                          <label className="block text-[10px] text-[#6B7280] mb-0.5">{t.apptWhen}</label>
                          <input
                            type="datetime-local"
                            value={apptLocal[b.id] ?? ""}
                            onChange={(e) => setApptLocal((prev) => ({ ...prev, [b.id]: e.target.value }))}
                            className="w-full border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-[#1C1917]"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-[#6B7280]">{t.apptBefore}</label>
                          <select
                            value={apptBeforeH[b.id] ?? 24}
                            onChange={(e) =>
                              setApptBeforeH((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))
                            }
                            className="border border-[#E5E0D8] rounded-lg px-2 py-1 bg-white"
                          >
                            {BEFORE_OPTIONS.map((h) => (
                              <option key={h} value={h}>
                                {h} {t.hours}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => void scheduleAppointment(b)}
                          className="w-full py-2 rounded-xl border border-[#1B4332] text-[#1B4332] text-xs font-semibold hover:bg-[#F0FDF4]"
                        >
                          {t.saveAppt}
                        </button>
                      </div>
                    </details>

                    {reminderMsg[b.id] && (
                      <p
                        className={`text-[11px] mt-2 ${reminderMsg[b.id].startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {reminderMsg[b.id]}
                      </p>
                    )}
                  </div>

                  {b.has_review ? (
                    <p className="text-xs text-emerald-600 mt-3">✓ {t.reviewed}</p>
                  ) : b.status === "cancelled" ? (
                    <p className="text-xs text-amber-800 mt-3 leading-relaxed">{t.cancelledBlurb}</p>
                  ) : b.status === "completed" ? (
                    <ReviewBlock
                      booking={b}
                      lang={lang}
                      onDone={() => {
                        setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, has_review: true } : x)));
                      }}
                    />
                  ) : (
                    <p className="text-xs text-[#6B7280] mt-3 leading-relaxed">{t.reviewPending}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          <GuaranteeBadge compact lang={lang} />
        </div>
      </div>
    </main>
  );
}
