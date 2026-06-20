"use client";

import type { Lang } from "@/lib/i18n-lang";

function MessageIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function scrollToInAppChat() {
  const chat = document.getElementById("listing-inapp-chat");
  const booking = document.getElementById("booking-section");
  const el = chat ?? booking;
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Hero CTA — in-app messaging first (no WhatsApp green bar for buyers). */
export default function ListingInAppCTA({
  lang = "es",
  serviceListing = false,
}: {
  lang?: Lang;
  serviceListing?: boolean;
}) {
  const t =
    lang === "en"
      ? {
          cta: serviceListing ? "Message provider in the app" : "Message seller in the app",
          hint: "Quotes, updates, and booking status stay here. WhatsApp is only for quick alerts with a link back.",
        }
      : {
          cta: serviceListing ? "Escribir al proveedor en la app" : "Escribir al vendedor en la app",
          hint: "Cotizaciones, avisos y estado de tu reserva aquí. WhatsApp solo para alertas rápidas con enlace.",
        };

  return (
    <div>
      <button
        type="button"
        onClick={scrollToInAppChat}
        className="w-full py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all bg-[#1B4332] text-white px-3 leading-snug"
      >
        <MessageIcon size={22} />
        <span>{t.cta}</span>
      </button>
      <p className="text-center text-xs text-[#6B7280] mt-2 leading-snug">{t.hint}</p>
    </div>
  );
}
