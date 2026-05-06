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

export default function SellerBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<SellerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings?seller=1&status=paid", { credentials: "same-origin" });
    if (res.status === 401) {
      router.push("/auth/login?returnTo=/seller-bookings");
      return;
    }
    const data = res.ok ? await res.json() : { bookings: [] };
    setBookings(Array.isArray(data.bookings) ? data.bookings : []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const markComplete = async (id: string) => {
    setBusyId(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      setMsg((m) => ({
        ...m,
        [id]: "✓ El cliente recibirá un WhatsApp para valorarte.",
      }));
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "completed" } : b)));
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
          Cuando termines el servicio, marca &quot;Completado&quot;. El cliente recibe un enlace por WhatsApp para dejar
          reseña.
        </p>

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center text-sm text-[#6B7280]">
            Aún no hay reservas pagadas.
          </div>
        ) : (
          <ul className="space-y-3">
            {bookings.map((b) => (
              <li key={b.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-sm">
                <p className="text-sm font-semibold text-[#1C1917]">{b.listing_title}</p>
                <p className="text-xs text-[#6B7280] mt-1">Cliente: {b.buyer_name}</p>
                <p className="text-xs text-[#1B4332] font-semibold mt-1">{formatMXN(b.commission_amount_cents)} tarifa</p>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5 font-mono">{b.id.slice(0, 8)}…</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      b.status === "completed"
                        ? "bg-emerald-100 text-emerald-800"
                        : b.status === "confirmed"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-[#F4F0EB] text-[#6B7280]"
                    }`}
                  >
                    {b.status === "completed"
                      ? "Completado"
                      : b.status === "confirmed"
                        ? "Confirmado"
                        : b.status}
                  </span>
                  {b.has_review && (
                    <span className="text-[10px] font-semibold text-amber-700">★ Reseña recibida</span>
                  )}
                </div>
                {b.status === "confirmed" && (
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => void markComplete(b.id)}
                    className="mt-3 w-full py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {busyId === b.id ? "…" : "Marcar servicio como completado"}
                  </button>
                )}
                {msg[b.id] && (
                  <p
                    className={`text-xs mt-2 ${msg[b.id].startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {msg[b.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
