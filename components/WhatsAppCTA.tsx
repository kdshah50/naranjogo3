"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

type BookingInfo = {
  checkoutBlocked: boolean;
  revealedWhatsappUrl: string | null;
};

export default function WhatsAppCTA({
  listingId,
  lang = "es",
}: {
  listingId: string;
  /** From listing `?lang=` — affects hero CTA labels only. */
  lang?: Lang;
}) {
  const [state, setState] = useState<"loading" | "locked" | "unlocked">("loading");
  const [waUrl, setWaUrl] = useState<string | null>(null);

  const t =
    lang === "en"
      ? {
          loading: "Loading…",
          contactWa: "Contact on WhatsApp",
          scheduleCta: "Send a message to schedule",
        }
      : {
          loading: "Cargando…",
          contactWa: "Contactar por WhatsApp",
          scheduleCta: "Enviar mensaje para agendar",
        };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings/${listingId}/service-booking`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setState("locked");
        return;
      }
      const data: BookingInfo = await res.json();
      if (data.revealedWhatsappUrl) {
        setState("unlocked");
        setWaUrl(data.revealedWhatsappUrl);
      } else {
        setState("locked");
      }
    } catch {
      setState("locked");
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div
        className="w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 opacity-60"
        style={{ background: "#25D366", color: "white" }}
      >
        <WhatsAppIcon size={22} />
        <span>{t.loading}</span>
      </div>
    );
  }

  if (state === "unlocked" && waUrl) {
    return (
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all hover:brightness-110"
        style={{ background: "#25D366", color: "white" }}
      >
        <WhatsAppIcon size={22} />
        {t.contactWa}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        const chat = document.getElementById("listing-inapp-chat");
        const booking = document.getElementById("booking-section");
        const el = chat ?? booking;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="w-full py-4 rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all relative overflow-hidden group text-center px-3 leading-snug"
      style={{ background: "linear-gradient(135deg, #20BD5A 0%, #128C7E 100%)", color: "white" }}
    >
      <span className="shrink-0 inline-flex">
        <WhatsAppIcon size={22} />
      </span>
      <span>{t.scheduleCta}</span>
      <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export function WhatsAppBadgeLocked() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-[#E7F9EE] text-[#128C7E]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      WhatsApp disponible
    </span>
  );
}
