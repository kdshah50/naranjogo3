"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SellerBooking = {
  id: string;
  listing_id: string;
  buyer_id: string;
  commission_amount_cents: number;
  payment_status: string;
  status: string;
  paid_at: string | null;
  ticket_code: string | null;
  listing_title: string;
  buyer_name: string;
  has_review?: boolean;
};

function formatMXN(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function phaseLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case "confirmed":
      return { label: "Pagado — pendiente agendar", cls: "bg-blue-50 text-blue-800" };
    case "scheduled":
      return { label: "Agendado", cls: "bg-indigo-50 text-indigo-800" };
    case "in_progress":
      return { label: "En curso", cls: "bg-amber-50 text-amber-900" };
    case "completed":
      return { label: "Completado", cls: "bg-emerald-100 text-emerald-800" };
    case "cancelled":
      return { label: "Cancelada", cls: "bg-red-50 text-red-800" };
    default:
      return { label: status, cls: "bg-[#F4F0EB] text-[#6B7280]" };
  }
}

export default function SellerBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<SellerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [sellerStrikeCount, setSellerStrikeCount] = useState<number | null>(null);
  const [sellerCancelCode, setSellerCancelCode] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings?seller=1&status=paid", { credentials: "same-origin" });
    if (res.status === 401) {
      router.push("/auth/login?returnTo=/seller-bookings");
      return;
    }
    const data = res.ok ? await res.json() : { bookings: [] };
    const list = Array.isArray(data.bookings) ? data.bookings : [];
    setBookings(list);
    if (typeof data.sellerStrikeCount === "number") setSellerStrikeCount(data.sellerStrikeCount);
    const initCodes: Record<string, string> = {};
    for (const row of list as SellerBooking[]) {
      initCodes[row.id] = "mutual_agreement";
    }
    setSellerCancelCode((prev) => ({ ...initCodes, ...prev }));
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      const texts: Record<string, string> = {
        scheduled: "✓ Cliente notificado (agendado).",
        in_progress: "✓ Cliente notificado (servicio en curso).",
        completed: "✓ Cliente recibirá WhatsApp para reseña.",
      };
      setMsg((m) => ({ ...m, [id]: texts[status] ?? "✓ Actualizado" }));
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status === "completed" ? "completed" : status } : b))
      );
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
      setMsg((m) => ({ ...m, [id]: "✓ Reserva cancelada; cliente notificado por WhatsApp si hay número." }));
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
          ← Mi perfil
        </Link>
        <h1 className="font-serif text-2xl font-bold text-[#1C1917] mb-1">Reservas de clientes</h1>
        <p className="text-sm text-[#6B7280] mb-6">
          Avanza el estado en la app: <strong>Agendado</strong> → <strong>En curso</strong> →{" "}
          <strong>Completado</strong>. El cliente recibe WhatsApp en cada paso; al completar, el enlace para reseña.
          WhatsApp sigue siendo respaldo — aquí queda la auditoría.
        </p>

        {sellerStrikeCount !== null && sellerStrikeCount > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <strong>Ranking / garantía:</strong> tienes{" "}
            <strong>{sellerStrikeCount}</strong>{" "}
            {sellerStrikeCount === 1
              ? "marca por no-show verificada (reclamo aprobado)."
              : "marcas por no-show verificadas (reclamos aprobados)."}{" "}
            La búsqueda ya penaliza cancelaciones; las marcas cuentan para disputas y revisión manual del equipo.
          </div>
        )}

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center text-sm text-[#6B7280]">
            Aún no hay reservas pagadas.
          </div>
        ) : (
          <ul className="space-y-4">
            {bookings.map((b) => {
              const ph = phaseLabel(b.status);
              const disabled = busyId === b.id;
              return (
                <li key={b.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1C1917]">{b.listing_title}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5">Cliente: {b.buyer_name}</p>
                      {b.ticket_code ? (
                        <p className="text-xs font-mono font-bold text-[#1B4332] mt-1">🎫 {b.ticket_code}</p>
                      ) : (
                        <p className="text-[10px] text-[#9CA3AF] mt-1 font-mono">ref {b.id.slice(0, 8)}…</p>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${ph.cls}`}>
                      {ph.label}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mb-3">Tarifa plataforma: {formatMXN(b.commission_amount_cents)}</p>

                  {b.status !== "completed" && b.status !== "cancelled" && (
                    <div className="flex flex-col gap-2">
                      {(b.status === "confirmed" || b.status === "pending") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "scheduled")}
                          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          1 · Marcar como agendado
                        </button>
                      )}
                      {(b.status === "confirmed" || b.status === "scheduled") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "in_progress")}
                          className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {b.status === "confirmed" ? "Saltar a · Servicio en curso" : "2 · Servicio en curso"}
                        </button>
                      )}
                      {(b.status === "confirmed" || b.status === "scheduled" || b.status === "in_progress") && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchStatus(b.id, "completed")}
                          className="w-full py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-50"
                        >
                          Marcar como completado
                        </button>
                      )}
                      <details className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF9] px-3 py-2 mt-1">
                        <summary className="text-xs font-semibold text-[#57534E] cursor-pointer list-none">
                          Cancelar reserva / cliente no se presentó
                        </summary>
                        <p className="text-[10px] text-[#6B7280] mt-2 leading-relaxed">
                          Registra el motivo; queda en auditoría. No hay reembolso automático — la garantía y soporte
                          revisan caso por caso. Si el cliente no llegó, elige “Cliente no se presentó”.
                        </p>
                        <select
                          value={sellerCancelCode[b.id] ?? "mutual_agreement"}
                          onChange={(e) =>
                            setSellerCancelCode((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          className="mt-2 w-full border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="mutual_agreement">Acuerdo con el cliente</option>
                          <option value="seller_unavailable">No puedo atender (proveedor)</option>
                          <option value="buyer_no_show">Cliente no se presentó</option>
                          <option value="other">Otro</option>
                        </select>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void patchCancel(b.id)}
                          className="w-full mt-2 py-2 rounded-xl border border-red-300 text-red-800 text-xs font-semibold bg-white hover:bg-red-50 disabled:opacity-50"
                        >
                          Confirmar cancelación
                        </button>
                      </details>
                    </div>
                  )}

                  {b.status === "completed" && b.has_review && (
                    <p className="text-xs text-amber-700 font-semibold mt-2">★ Cliente ya envió reseña</p>
                  )}

                  {msg[b.id] && (
                    <p
                      className={`text-xs mt-2 ${msg[b.id].startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}
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
