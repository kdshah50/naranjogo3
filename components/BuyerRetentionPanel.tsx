"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import { withLang } from "@/lib/i18n-lang";

type LoyaltyReward = {
  everyN: number;
  discountPct: number;
  milestoneDiscountPct: number;
  rebookDiscountPct: number;
  bookingsUntilReward: number;
  bookingCount: number;
  rebookDiscount: boolean;
  milestoneDiscount: boolean;
};

/** @deprecated import from `@/lib/i18n-lang` */
export { withLang } from "@/lib/i18n-lang";

type Props = {
  lang: Lang;
  /** Larger card with primary “book again” (e.g. post-checkout). */
  variant: "post_payment" | "banner";
  listingId?: string;
};

export default function BuyerRetentionPanel({ lang, variant, listingId }: Props) {
  const es = lang === "es";
  const [reward, setReward] = useState<LoyaltyReward | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/loyalty", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { reward?: LoyaltyReward } | null) => {
        if (!cancelled && d?.reward) setReward(d.reward);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loyaltyLine = () => {
    if (!reward) return null;
    const count = reward.bookingCount ?? 0;
    const until = reward.bookingsUntilReward ?? 0;
    const pct = reward.milestoneDiscount
      ? reward.milestoneDiscountPct
      : reward.rebookDiscount
        ? reward.rebookDiscountPct
        : null;

    if (reward.milestoneDiscount && until === 0) {
      return es
        ? `¡Tu próxima reserva puede llevar ~${reward.milestoneDiscountPct}% de descuento en la tarifa de plataforma!`
        : `Your next booking may get ~${reward.milestoneDiscountPct}% off the platform fee!`;
    }
    if (until > 0 && reward.everyN) {
      return es
        ? `Lealtad: ${until} reserva${until === 1 ? "" : "s"} más para un descuento mayor en la tarifa (~cada ${reward.everyN} reservas). Llevas ${count}.`
        : `Loyalty: ${until} more booking${until === 1 ? "" : "s"} until a bigger platform-fee discount (~every ${reward.everyN} bookings). You’re at ${count}.`;
    }
    if (pct && reward.rebookDiscount) {
      return es
        ? `Como cliente que vuelve, puedes ver ~${pct}% de descuento en la tarifa en reservas elegibles.`
        : `As a returning customer, you may see ~${pct}% off the platform fee on eligible bookings.`;
    }
    return es
      ? `Cada reserva suma a tu lealtad y descuentos en la plataforma.`
      : `Each booking builds loyalty and platform-fee savings.`;
  };

  if (variant === "banner") {
    if (!loaded) return null;
    const line = loyaltyLine();
    if (!line) return null;
    return (
      <div className="rounded-2xl border border-[#1B4332]/20 bg-gradient-to-r from-[#ECFDF5] to-white px-4 py-3 mb-4">
        <p className="text-sm text-[#065F46] font-medium leading-snug">{line}</p>
        <div className="flex flex-wrap gap-3 mt-2 text-xs font-semibold">
          <Link href={withLang("/claims", lang)} className="text-[#1B4332] hover:underline">
            {es ? "Garantía / reclamo →" : "Guarantee / claim →"}
          </Link>
          <Link href={withLang("/messages", lang)} className="text-[#1B4332] hover:underline">
            {es ? "Mensajes →" : "Messages →"}
          </Link>
        </div>
      </div>
    );
  }

  // post_payment
  const line = loyaltyLine();
  return (
    <section
      className="rounded-2xl border-2 border-[#1B4332]/15 bg-white shadow-sm overflow-hidden"
      aria-labelledby="retention-next-heading"
    >
      <div className="bg-[#1B4332] text-white px-4 py-2.5">
        <h2 id="retention-next-heading" className="text-sm font-bold">
          {es ? "Tu relación con el servicio vive aquí" : "Your service relationship lives here"}
        </h2>
        <p className="text-[11px] text-white/90 mt-0.5 leading-snug">
          {es
            ? "Vuelve a reservar, chatea y usa la garantía sin salir de Naranjogo."
            : "Rebook, message, and use the guarantee without leaving Naranjogo."}
        </p>
      </div>
      <div className="p-4 space-y-4">
        {listingId && (
          <Link
            href={withLang(`/listing/${listingId}`, lang)}
            className="block w-full py-3.5 rounded-xl bg-[#D4A017] text-white text-center text-sm font-bold hover:bg-[#C4900D] transition-colors"
          >
            {es ? "Volver a reservar este servicio" : "Book this service again"}
          </Link>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          <Link
            href={withLang("/my-bookings", lang)}
            className="inline-flex px-4 py-2 rounded-xl bg-[#F4F0EB] text-[#1B4332] text-sm font-semibold hover:bg-[#E5E0D8]"
          >
            {es ? "Mis reservas" : "My bookings"}
          </Link>
          <Link
            href={withLang("/messages", lang)}
            className="inline-flex px-4 py-2 rounded-xl bg-[#F4F0EB] text-[#1B4332] text-sm font-semibold hover:bg-[#E5E0D8]"
          >
            {es ? "Mensajes" : "Messages"}
          </Link>
          <Link
            href={withLang("/claims", lang)}
            className="inline-flex px-4 py-2 rounded-xl border border-[#1B4332]/30 text-[#1B4332] text-sm font-semibold hover:bg-[#ECFDF5]"
          >
            {es ? "Garantía" : "Guarantee"}
          </Link>
        </div>
        {loaded && line && (
          <p className="text-xs text-[#047857] text-center leading-relaxed bg-[#ECFDF5] rounded-xl px-3 py-2 border border-emerald-100">
            ★ {line}
          </p>
        )}
      </div>
    </section>
  );
}
