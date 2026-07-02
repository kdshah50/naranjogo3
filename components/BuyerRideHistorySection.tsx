"use client";

import Link from "next/link";
import { rideStatusLabel } from "@/lib/rides/ui-copy";
import { formatCurrencyMXN } from "@/lib/locale-format";

export type BuyerRideHistoryRow = {
  id: string;
  status: string;
  ticket_code: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_total_mxn_cents: number;
  final_total_mxn_cents?: number | null;
  updated_at?: string | null;
  created_at?: string;
};

type Props = {
  rides: BuyerRideHistoryRow[];
  lang: "es" | "en";
  ticketHighlight?: string | null;
};

function rideAmount(row: BuyerRideHistoryRow): number {
  if (typeof row.final_total_mxn_cents === "number" && row.final_total_mxn_cents > 0) {
    return row.final_total_mxn_cents;
  }
  return row.estimated_total_mxn_cents;
}

function isOpenRide(status: string): boolean {
  return ["requested", "matched", "accepted", "arrived", "in_trip"].includes(status);
}

export default function BuyerRideHistorySection({ rides, lang, ticketHighlight }: Props) {
  if (rides.length === 0) return null;

  const t =
    lang === "es"
      ? {
          sectionTitle: "Mis viajes (taxi)",
          sectionBlurb: "Los viajes NG-… se gestionan en Pedir viaje — no en reservas de servicios.",
          openTrip: "Ver viaje activo →",
          viewTrip: "Abrir en Pedir viaje →",
          estimate: "Estimado",
          final: "Total",
        }
      : {
          sectionTitle: "My rides (taxi)",
          sectionBlurb: "NG-… ride tickets live on Request ride — not on service bookings.",
          openTrip: "View active ride →",
          viewTrip: "Open in Request ride →",
          estimate: "Estimate",
          final: "Total",
        };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-[#1B4332]">🚕 {t.sectionTitle}</h2>
        <Link href="/viaje" className="text-xs font-semibold text-[#1B4332] hover:underline">
          {lang === "es" ? "Pedir viaje →" : "Request ride →"}
        </Link>
      </div>
      <p className="text-[11px] text-[#6B7280] mb-3">{t.sectionBlurb}</p>
      <div className="flex flex-col gap-3">
        {rides.map((r) => {
          const ticket = (r.ticket_code ?? "").trim().toUpperCase();
          const highlighted = ticketHighlight && ticket === ticketHighlight.trim().toUpperCase();
          const href = ticket ? `/viaje?ticket=${encodeURIComponent(ticket)}` : "/viaje";
          const when = r.updated_at ?? r.created_at ?? "";
          const whenLabel = when
            ? new Date(when).toLocaleString(lang === "es" ? "es-MX" : "en-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "";

          return (
            <div
              key={r.id}
              className={`bg-white rounded-2xl border p-4 shadow-sm ${
                highlighted ? "border-[#1B4332] ring-1 ring-[#1B4332]/20" : "border-[#E5E0D8]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1C1917] truncate">
                    {r.pickup_address} → {r.dropoff_address}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2 items-center">
                    {ticket ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-900">
                        🎫 {ticket}
                      </span>
                    ) : null}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isOpenRide(r.status)
                          ? "bg-amber-100 text-amber-900"
                          : r.status === "completed"
                            ? "bg-[#ECFDF5] text-[#065F46]"
                            : "bg-[#F4F0EB] text-[#374151]"
                      }`}
                    >
                      {rideStatusLabel(r.status, lang)}
                    </span>
                  </div>
                  {whenLabel ? <p className="text-[10px] text-[#9CA3AF] mt-1.5">{whenLabel}</p> : null}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[#1B4332]">
                    {formatCurrencyMXN(rideAmount(r), lang)}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF]">
                    {r.status === "completed" ? t.final : t.estimate}
                  </p>
                </div>
              </div>
              <Link
                href={href}
                className="mt-3 inline-block text-xs font-semibold text-[#1B4332] hover:underline"
              >
                {isOpenRide(r.status) ? t.openTrip : t.viewTrip}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
