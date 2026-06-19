import type {
  HousekeepingQuoteBasis,
  HousekeepingVisitFrequency,
  ServiceMenu,
  ServiceMenuItem,
} from "@/lib/listing-service-menu";
import {
  HOUSEKEEPING_VISIT_FREQUENCIES,
  computeHousekeepingQuoteTotals,
  housekeepingAgreedPriceCents,
} from "@/lib/listing-service-menu";

export const SERVICE_QUOTE_STATUSES = ["none", "pending", "accepted", "declined"] as const;
export type ServiceQuoteStatus = (typeof SERVICE_QUOTE_STATUSES)[number];

export type ServiceQuoteLineItem = {
  sku: string;
  qty: number;
  name_es: string;
  name_en?: string | null;
  price_mxn_cents: number;
};

export type ServiceQuoteMetadata = {
  visitFrequency?: HousekeepingVisitFrequency;
  quoteBasis?: HousekeepingQuoteBasis;
  buyerNotes?: string | null;
  lang?: "es" | "en";
  kind?: "buyer_request" | "provider_quote";
  buyerFirstName?: string;
  buyerLastName?: string;
  contactPhone?: string;
  whatsappPhone?: string | null;
  serviceAddress?: string;
  /** ISO datetime — preferred visit before quote */
  preferredAt?: string;
  /** Saved line items for rebook form prefill (cleared from gate row until buyer submits). */
  rebookPrefillLineItems?: ServiceQuoteLineItem[];
};

export function normalizeQuoteStatus(raw: unknown): ServiceQuoteStatus {
  const s = String(raw ?? "none").trim().toLowerCase();
  return (SERVICE_QUOTE_STATUSES as readonly string[]).includes(s) ? (s as ServiceQuoteStatus) : "none";
}

/** Buyer UI: treat sent-but-unresponded quotes as pending even if status column lagged. */
export function buyerFacingQuoteStatus(
  quoteStatus: ServiceQuoteStatus,
  quoteSentAt?: string | null,
): ServiceQuoteStatus {
  if (quoteStatus === "pending" || quoteStatus === "accepted" || quoteStatus === "declined") {
    return quoteStatus;
  }
  return quoteSentAt ? "pending" : quoteStatus;
}

export function parseQuoteLineItems(raw: unknown): ServiceQuoteLineItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ServiceQuoteLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const sku = String(o.sku ?? "").trim();
    const qty = Math.round(Number(o.qty));
    const name_es = String(o.name_es ?? "").trim();
    const price_mxn_cents = Math.round(Number(o.price_mxn_cents));
    if (!sku || !name_es || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price_mxn_cents)) continue;
    out.push({
      sku,
      qty,
      name_es,
      name_en: typeof o.name_en === "string" ? o.name_en : null,
      price_mxn_cents,
    });
  }
  return out.length > 0 ? out : null;
}

export function parseQuoteMetadata(raw: unknown): ServiceQuoteMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const meta: ServiceQuoteMetadata = {};
  if (typeof o.visitFrequency === "string") meta.visitFrequency = o.visitFrequency as HousekeepingVisitFrequency;
  if (typeof o.quoteBasis === "string") meta.quoteBasis = o.quoteBasis as HousekeepingQuoteBasis;
  if (typeof o.buyerNotes === "string") meta.buyerNotes = o.buyerNotes;
  if (o.lang === "en" || o.lang === "es") meta.lang = o.lang;
  if (o.kind === "buyer_request" || o.kind === "provider_quote") meta.kind = o.kind;
  if (typeof o.buyerFirstName === "string") meta.buyerFirstName = o.buyerFirstName.trim();
  if (typeof o.buyerLastName === "string") meta.buyerLastName = o.buyerLastName.trim();
  if (typeof o.contactPhone === "string") meta.contactPhone = o.contactPhone.trim();
  if (typeof o.whatsappPhone === "string") meta.whatsappPhone = o.whatsappPhone.trim() || null;
  if (o.whatsappPhone === null) meta.whatsappPhone = null;
  if (typeof o.serviceAddress === "string") meta.serviceAddress = o.serviceAddress.trim();
  if (typeof o.preferredAt === "string") meta.preferredAt = o.preferredAt.trim();
  const prefill = parseQuoteLineItems(o.rebookPrefillLineItems);
  if (prefill?.length) meta.rebookPrefillLineItems = prefill;
  return Object.keys(meta).length > 0 ? meta : null;
}

type CartLine = { sku: string; qty: number };

export function lineItemsFromCart(menu: ServiceMenu | null | undefined, cartLines: CartLine[]): ServiceQuoteLineItem[] {
  if (!menu?.items?.length) return [];
  const bySku = new Map(menu.items.map((it) => [it.sku, it]));
  const out: ServiceQuoteLineItem[] = [];
  for (const { sku, qty } of cartLines) {
    const it = bySku.get(sku);
    if (!it || qty <= 0) continue;
    out.push({
      sku,
      qty,
      name_es: it.name_es,
      name_en: it.name_en,
      price_mxn_cents: it.price_mxn_cents,
    });
  }
  return out;
}

export function formatMxn(cents: number, lang: "es" | "en" = "es"): string {
  return new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function buildMenuQuoteMessage(opts: {
  menu: ServiceMenu;
  lineItems: ServiceQuoteLineItem[];
  totalCents: number;
  lang?: "es" | "en";
  visitFrequency?: HousekeepingVisitFrequency;
  quoteBasis?: HousekeepingQuoteBasis;
  headerKind?: "provider_quote" | "buyer_request";
}): string {
  const lang = opts.lang ?? "es";
  const formatter = (cents: number) => formatMxn(cents, lang);
  const isRequest = opts.headerKind === "buyer_request";
  const header = isRequest
    ? lang === "en"
      ? "Cleaning request (from menu):"
      : "Solicitud de limpieza (desde menú):"
    : lang === "en"
      ? "📋 Quote from your provider:"
      : "📋 Cotización de tu proveedor:";

  const lines = opts.lineItems.map((it) => {
    const label = (lang === "en" && it.name_en) || it.name_es;
    return `• ${it.qty}× ${label} — ${formatter(it.price_mxn_cents * it.qty)}`;
  });

  const freqRow = opts.visitFrequency
    ? HOUSEKEEPING_VISIT_FREQUENCIES.find((f) => f.id === opts.visitFrequency)
    : null;
  const freqLine = freqRow
    ? lang === "en"
      ? `Frequency: ${freqRow.label_en}`
      : `Frecuencia: ${freqRow.label_es}`
    : null;

  const isRecurring = opts.visitFrequency && opts.visitFrequency !== "one_time";
  const hkTotals =
    isRecurring && opts.menu
      ? computeHousekeepingQuoteTotals(
          opts.menu,
          opts.lineItems.map((x) => ({ sku: x.sku, qty: x.qty })),
          opts.visitFrequency!,
        )
      : null;

  const basisLine =
    hkTotals && isRecurring && opts.quoteBasis
      ? lang === "en"
        ? `Basis: ${opts.quoteBasis === "monthly_package" ? "Monthly package" : "Per visit"}`
        : `Base: ${opts.quoteBasis === "monthly_package" ? "Paquete mensual" : "Por visita"}`
      : null;

  const totalLine = isRequest
    ? lang === "en"
      ? `Estimated total: ${formatter(opts.totalCents)}`
      : `Total estimado: ${formatter(opts.totalCents)}`
    : lang === "en"
      ? `Total quoted: ${formatter(opts.totalCents)}`
      : `Total cotizado: ${formatter(opts.totalCents)}`;

  const actionLine = isRequest
    ? lang === "en"
      ? "Please review and send your official quote in the app."
      : "Revisa y envía tu cotización oficial en la app."
    : lang === "en"
      ? "Open the app to Accept or Decline this quote."
      : "Abre la app para Aceptar o Rechazar esta cotización.";

  const disclaimer = (lang === "en" ? opts.menu.disclaimer_en : opts.menu.disclaimer_es) ?? "";

  return [header, freqLine, basisLine, ...lines, "", totalLine, actionLine, disclaimer]
    .filter((s) => s != null && String(s).length > 0)
    .join("\n");
}

export function computeQuoteTotalCents(opts: {
  menu: ServiceMenu;
  cartLines: CartLine[];
  visitFrequency?: HousekeepingVisitFrequency;
  quoteBasis?: HousekeepingQuoteBasis;
  quoteLayout?: "default" | "housekeeping";
}): number {
  if (opts.quoteLayout === "housekeeping" && opts.visitFrequency) {
    const totals = computeHousekeepingQuoteTotals(opts.menu, opts.cartLines, opts.visitFrequency);
    return housekeepingAgreedPriceCents(totals, opts.quoteBasis ?? "per_visit");
  }
  let sum = 0;
  const bySku = new Map(opts.menu.items.map((it: ServiceMenuItem) => [it.sku, it]));
  for (const { sku, qty } of opts.cartLines) {
    const it = bySku.get(sku);
    if (it && qty > 0) sum += it.price_mxn_cents * qty;
  }
  return sum;
}

export function quoteStatusLabel(status: ServiceQuoteStatus, lang: "es" | "en"): string {
  if (lang === "en") {
    if (status === "pending") return "Awaiting your response";
    if (status === "accepted") return "Accepted — pay deposit below";
    if (status === "declined") return "Declined";
    return "No quote yet";
  }
  if (status === "pending") return "Esperando tu respuesta";
  if (status === "accepted") return "Aceptada — paga el depósito abajo";
  if (status === "declined") return "Rechazada";
  return "Sin cotización aún";
}
