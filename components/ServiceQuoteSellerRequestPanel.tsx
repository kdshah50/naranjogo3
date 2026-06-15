"use client";

import {
  HOUSEKEEPING_VISIT_FREQUENCIES,
  type ServiceMenu,
} from "@/lib/listing-service-menu";
import {
  computeQuoteTotalCents,
  formatMxn,
  type ServiceQuoteLineItem,
  type ServiceQuoteMetadata,
} from "@/lib/service-quote";
import { buyerContactFromMetadata } from "@/lib/buyer-quote-contact";
import {
  preferredDatetimeLabel,
  sellerRequestPanelTitle,
  type ServiceQuoteLayout,
} from "@/lib/service-quote-vertical";

type Props = {
  lineItems: ServiceQuoteLineItem[];
  metadata: ServiceQuoteMetadata | null;
  menu: ServiceMenu;
  lang: "es" | "en";
  quoteLayout?: ServiceQuoteLayout;
  providerSlug?: string | null;
};

function formatPreferredAt(iso: string, lang: "es" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === "en" ? "en-MX" : "es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Read-only buyer service request — shown to provider before they send official quote. */
export default function ServiceQuoteSellerRequestPanel({
  lineItems,
  metadata,
  menu,
  lang,
  quoteLayout = "default",
  providerSlug = null,
}: Props) {
  const es = lang === "es";
  const freq = metadata?.visitFrequency
    ? HOUSEKEEPING_VISIT_FREQUENCIES.find((f) => f.id === metadata.visitFrequency)
    : null;
  const contact = buyerContactFromMetadata(metadata);

  const totalCents = computeQuoteTotalCents({
    menu,
    cartLines: lineItems.map((x) => ({ sku: x.sku, qty: x.qty })),
    visitFrequency: metadata?.visitFrequency,
    quoteBasis: metadata?.quoteBasis,
    quoteLayout,
  });

  return (
    <div
      id="seller-request-panel"
      className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-3 space-y-2"
    >
      <p className="text-xs font-bold text-[#065F46]">
        {sellerRequestPanelTitle(providerSlug, lang)}
      </p>
      {contact ? (
        <div className="rounded-lg border border-emerald-200 bg-white/80 px-2 py-2 space-y-1 text-[11px] text-[#065F46]">
          <p className="font-semibold text-[#047857]">{es ? "Datos del cliente" : "Customer details"}</p>
          <p>
            {es ? "Nombre" : "Name"}: {contact.firstName} {contact.lastName}
          </p>
          <p>
            {es ? "Teléfono" : "Phone"}: +{contact.contactPhone}
          </p>
          {contact.whatsappPhone && contact.whatsappPhone !== contact.contactPhone ? (
            <p>
              WhatsApp: +{contact.whatsappPhone}
            </p>
          ) : null}
          <p>
            {es ? "Dirección" : "Address"}: {contact.serviceAddress}
          </p>
          <p>
            {preferredDatetimeLabel(providerSlug, lang)}: {formatPreferredAt(contact.preferredAt, lang)}
          </p>
        </div>
      ) : null}
      {freq ? (
        <p className="text-[11px] text-[#047857]">
          {es ? "Frecuencia" : "Frequency"}: {es ? freq.label_es : freq.label_en}
          {metadata?.quoteBasis && metadata.visitFrequency !== "one_time"
            ? ` · ${metadata.quoteBasis === "monthly_package" ? (es ? "Paquete mensual" : "Monthly package") : es ? "Por visita" : "Per visit"}`
            : null}
        </p>
      ) : null}
      <ul className="text-[11px] text-[#065F46] space-y-1">
        {lineItems.map((it) => {
          const label = (lang === "en" && it.name_en) || it.name_es;
          return (
            <li key={it.sku}>
              • {it.qty}× {label} — {formatMxn(it.price_mxn_cents * it.qty, lang)}
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-semibold text-[#065F46]">
        {es ? "Total estimado" : "Estimated total"}: {formatMxn(totalCents, lang)}
      </p>
      {metadata?.buyerNotes ? (
        <p className="text-[11px] text-[#047857] italic">
          {es ? "Notas" : "Notes"}: {metadata.buyerNotes}
        </p>
      ) : null}
      <p className="text-[10px] text-[#059669] leading-snug">
        {es
          ? "Revisa abajo, ajusta si hace falta y pulsa «Enviar cotización al cliente»."
          : "Review below, adjust if needed, then tap Send official quote to customer."}
      </p>
    </div>
  );
}
