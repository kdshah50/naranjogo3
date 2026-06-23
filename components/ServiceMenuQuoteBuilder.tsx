"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeHousekeepingQuoteTotals,
  computeServiceMenuQuoteCents,
  housekeepingAgreedPriceCents,
  HOUSEKEEPING_QUICK_QUOTE_GROUPS,
  HOUSEKEEPING_VISIT_FREQUENCIES,
  type HousekeepingQuoteBasis,
  type HousekeepingVisitFrequency,
  type ServiceMenu,
} from "@/lib/listing-service-menu";

import {
  buildMenuQuoteMessage,
  computeQuoteTotalCents,
  lineItemsFromCart,
  type ServiceQuoteLineItem,
} from "@/lib/service-quote";
import {
  type BuyerQuoteContact,
  validateBuyerQuoteContact,
} from "@/lib/buyer-quote-contact";
import {
  buyerMenuPickerTitle,
  dropoffAddressLabel,
  preferredDatetimeLabel,
  serviceAddressLabel,
} from "@/lib/service-quote-vertical";
import { TRANSPORT_APP_SERVICE } from "@/lib/provider-services";

export type QuoteBuilderPayload = {
  totalCents: number;
  cartLines: Array<{ sku: string; qty: number }>;
  lineItems: ServiceQuoteLineItem[];
  visitFrequency: HousekeepingVisitFrequency;
  quoteBasis: HousekeepingQuoteBasis;
  messageBody: string;
  buyerNotes?: string | null;
  buyerContact?: BuyerQuoteContact;
};

/**
 * Seller-side quote builder for service menus (tailoring MVP).
 *
 * Shown inside `ListingChat` when the listing carries a `service_menu`.
 * Housekeeping: buyer variant collects request; seller sends official quote.
 */
export default function ServiceMenuQuoteBuilder({
  menu,
  onApplyTotal,
  onInsertAsMessage,
  onSendOfficialQuote,
  onSubmitRequest,
  lang = "es",
  disabled = false,
  quoteLayout = "default",
  requiresBuyerContact = false,
  providerSlug = null,
  variant = "seller",
  initialCartLines,
  initialVisitFrequency,
  initialQuoteBasis,
  initialBuyerContact,
}: {
  menu: ServiceMenu | null | undefined;
  /** Called with the running total in pesos (string), to drop into the parent's agreedPesos input. */
  onApplyTotal?: (pesos: string) => void;
  /** Optional: insert a formatted summary as a chat message. */
  onInsertAsMessage?: (body: string) => Promise<void> | void;
  /** Housekeeping seller: send official quote (pending + WhatsApp). */
  onSendOfficialQuote?: (payload: QuoteBuilderPayload) => Promise<void> | void;
  /** Housekeeping buyer: submit structured cleaning request. */
  onSubmitRequest?: (payload: QuoteBuilderPayload) => Promise<void> | void;
  lang?: "es" | "en";
  disabled?: boolean;
  /** Housekeeping: show quick room-type qty picks above the full menu list. */
  quoteLayout?: "default" | "housekeeping";
  /** Buyer must fill contact form before submitting quote request. */
  requiresBuyerContact?: boolean;
  providerSlug?: string | null;
  variant?: "seller" | "buyer";
  /** Seller: pre-fill from buyer's saved request. */
  initialCartLines?: Array<{ sku: string; qty: number }>;
  initialVisitFrequency?: HousekeepingVisitFrequency;
  initialQuoteBasis?: HousekeepingQuoteBasis;
  /** Buyer: pre-fill name/phone from profile */
  initialBuyerContact?: Partial<BuyerQuoteContact>;
}) {
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [visitFrequency, setVisitFrequency] = useState<HousekeepingVisitFrequency>("one_time");
  const [quoteBasis, setQuoteBasis] = useState<HousekeepingQuoteBasis>("per_visit");
  const [buyerNotes, setBuyerNotes] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [whatsappDifferent, setWhatsappDifferent] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [transportMode, setTransportMode] = useState<"custom" | "menu">("custom");
  const [preferredAtLocal, setPreferredAtLocal] = useState("");
  const [contactErr, setContactErr] = useState("");
  const [submitErr, setSubmitErr] = useState("");
  const contactSectionRef = useRef<HTMLDivElement | null>(null);
  const cartPrefillAppliedRef = useRef(false);

  useEffect(() => {
    cartPrefillAppliedRef.current = false;
  }, [menu, variant]);

  useEffect(() => {
    if (variant !== "buyer" || !requiresBuyerContact || !initialBuyerContact) return;
    if (initialBuyerContact.firstName && !contactFirstName) setContactFirstName(initialBuyerContact.firstName);
    if (initialBuyerContact.lastName && !contactLastName) setContactLastName(initialBuyerContact.lastName);
    if (initialBuyerContact.contactPhone && !contactPhone) setContactPhone(initialBuyerContact.contactPhone);
    if (initialBuyerContact.serviceAddress && !serviceAddress) setServiceAddress(initialBuyerContact.serviceAddress);
  }, [
    variant,
    requiresBuyerContact,
    initialBuyerContact,
    contactFirstName,
    contactLastName,
    contactPhone,
    serviceAddress,
  ]);

  useEffect(() => {
    if (!initialCartLines?.length || cartPrefillAppliedRef.current) return;
    cartPrefillAppliedRef.current = true;
    const next: Record<string, number> = {};
    for (const { sku, qty } of initialCartLines) {
      if (sku && qty > 0) next[sku] = qty;
    }
    setQtyBySku(next);
    if (initialVisitFrequency) setVisitFrequency(initialVisitFrequency);
    if (initialQuoteBasis) setQuoteBasis(initialQuoteBasis);
  }, [initialCartLines, initialVisitFrequency, initialQuoteBasis]);

  const cartLines = useMemo(
    () => Object.entries(qtyBySku).map(([sku, qty]) => ({ sku, qty })),
    [qtyBySku],
  );

  const isTransportCustomRequest =
    variant === "buyer" &&
    providerSlug === TRANSPORT_APP_SERVICE &&
    transportMode === "custom";

  const resolvedCartLines = useMemo(() => {
    if (cartLines.length > 0) return cartLines;
    if (isTransportCustomRequest && menu?.items.some((it) => it.sku === "other_trip")) {
      return [{ sku: "other_trip", qty: 1 }];
    }
    return cartLines;
  }, [cartLines, isTransportCustomRequest, menu?.items]);

  const housekeepingTotals = useMemo(
    () =>
      quoteLayout === "housekeeping"
        ? computeHousekeepingQuoteTotals(menu, resolvedCartLines, visitFrequency)
        : null,
    [quoteLayout, menu, resolvedCartLines, visitFrequency],
  );

  const isRecurring =
    quoteLayout === "housekeeping" && visitFrequency !== "one_time";

  const totalCents = useMemo(() => {
    if (quoteLayout === "housekeeping" && housekeepingTotals) {
      return housekeepingAgreedPriceCents(housekeepingTotals, quoteBasis);
    }
    return computeServiceMenuQuoteCents(menu, resolvedCartLines);
  }, [quoteLayout, housekeepingTotals, quoteBasis, menu, resolvedCartLines]);

  const menuSkus = useMemo(
    () => new Set((menu?.items ?? []).map((it) => it.sku)),
    [menu],
  );

  if (!menu || !Array.isArray(menu.items) || menu.items.length === 0) {
    return null;
  }

  const formatter = new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  const change = (sku: string, delta: number, alsoSetSku?: string) => {
    setQtyBySku((prev) => {
      const nextQty = Math.max(0, (prev[sku] ?? 0) + delta);
      const out = { ...prev };
      if (nextQty === 0) delete out[sku];
      else out[sku] = nextQty;

      if (alsoSetSku && nextQty > 0 && (out[alsoSetSku] ?? 0) === 0) {
        out[alsoSetSku] = 1;
      }
      return out;
    });
  };

  const quickGroups =
    quoteLayout === "housekeeping"
      ? HOUSEKEEPING_QUICK_QUOTE_GROUPS.filter((g) => menuSkus.has(g.sku))
      : [];

  const clearAll = () => {
    setQtyBySku({});
    setVisitFrequency("one_time");
    setQuoteBasis("per_visit");
  };

  const selectedLines = menu.items
    .map((it) => ({ it, qty: resolvedCartLines.find((c) => c.sku === it.sku)?.qty ?? 0 }))
    .filter((x) => x.qty > 0);

  const hasResolvedSelection = selectedLines.length > 0;
  const applyDisabled =
    disabled ||
    busy ||
    (!isTransportCustomRequest && totalCents <= 0) ||
    (isTransportCustomRequest && !hasResolvedSelection);
  const officialQuoteFlow = Boolean(onSendOfficialQuote);

  const applyToAgreedPrice = () => {
    onApplyTotal?.(String(totalCents / 100));
  };

  const buildBuyerContact = (): BuyerQuoteContact | null => {
    if (variant !== "buyer" || !requiresBuyerContact) return null;
    const preferredAt = preferredAtLocal.trim()
      ? new Date(preferredAtLocal).toISOString()
      : "";
    const address = isTransportCustomRequest
      ? `Origen: ${pickupAddress.trim()}\nDestino: ${dropoffAddress.trim()}`
      : serviceAddress.trim();
    return {
      firstName: contactFirstName.trim(),
      lastName: contactLastName.trim(),
      contactPhone: contactPhone.trim(),
      whatsappPhone: whatsappDifferent && whatsappPhone.trim() ? whatsappPhone.trim() : null,
      serviceAddress: address,
      preferredAt,
    };
  };

  const validateTransportCustomContact = (): string | null => {
    if (!isTransportCustomRequest) return null;
    const from = pickupAddress.trim();
    const to = dropoffAddress.trim();
    if (from.length < 4) {
      return lang === "en" ? "Enter where you are leaving from." : "Indica el origen del viaje.";
    }
    if (to.length < 4) {
      return lang === "en" ? "Enter your destination." : "Indica el destino del viaje.";
    }
    return null;
  };

  const buildPayload = (): QuoteBuilderPayload => {
    const lineItems = lineItemsFromCart(menu, resolvedCartLines);
    const messageBody = buildMenuQuoteMessage({
      menu: menu!,
      lineItems,
      totalCents,
      lang,
      visitFrequency: quoteLayout === "housekeeping" ? visitFrequency : undefined,
      quoteBasis: quoteLayout === "housekeeping" ? quoteBasis : undefined,
      headerKind: variant === "buyer" ? "buyer_request" : "provider_quote",
    });
    return {
      totalCents,
      cartLines: resolvedCartLines,
      lineItems,
      visitFrequency,
      quoteBasis,
      messageBody,
      buyerNotes: buyerNotes.trim() || null,
      buyerContact: buildBuyerContact() ?? undefined,
    };
  };

  const sendOfficialQuote = async () => {
    if (!onSendOfficialQuote || selectedLines.length === 0) return;
    setBusy(true);
    try {
      await onSendOfficialQuote(buildPayload());
    } finally {
      setBusy(false);
    }
  };

  const submitRequest = async () => {
    if (!onSubmitRequest || !hasResolvedSelection) return;
    setSubmitErr("");
    if (variant === "buyer" && requiresBuyerContact) {
      const transportErr = validateTransportCustomContact();
      if (transportErr) {
        setContactErr(transportErr);
        contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      const contact = buildBuyerContact();
      const err = contact ? validateBuyerQuoteContact(contact, lang) : lang === "en" ? "Complete your contact details." : "Completa tus datos de contacto.";
      if (err) {
        setContactErr(err);
        contactSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
      setContactErr("");
    }
    setBusy(true);
    try {
      await onSubmitRequest(buildPayload());
      clearAll();
      setBuyerNotes("");
      setContactFirstName("");
      setContactLastName("");
      setContactPhone("");
      setWhatsappDifferent(false);
      setWhatsappPhone("");
      setServiceAddress("");
      setPickupAddress("");
      setDropoffAddress("");
      setPreferredAtLocal("");
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : lang === "en"
            ? "Could not send request. Try again."
            : "No se pudo enviar la solicitud. Intenta de nuevo.";
      setSubmitErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const insertAsMessage = async () => {
    if (!onInsertAsMessage || selectedLines.length === 0) return;
    const lines = selectedLines.map(({ it, qty }) => {
      const label = (lang === "en" && it.name_en) || it.name_es;
      const lineTotal = formatter.format((it.price_mxn_cents * qty) / 100);
      return `• ${qty}× ${label} — ${lineTotal}`;
    });
    const freqRow = HOUSEKEEPING_VISIT_FREQUENCIES.find((f) => f.id === visitFrequency);
    const freqLabel =
      quoteLayout === "housekeeping" && freqRow
        ? lang === "en"
          ? freqRow.label_en
          : freqRow.label_es
        : null;
    const header =
      lang === "en"
        ? "Quote based on the menu:"
        : "Cotización basada en el menú:";
    const freqLine =
      freqLabel && quoteLayout === "housekeeping"
        ? lang === "en"
          ? `Frequency: ${freqLabel}`
          : `Frecuencia: ${freqLabel}`
        : null;
    const basisLine =
      quoteLayout === "housekeeping" && housekeepingTotals && isRecurring
        ? lang === "en"
          ? `Agreed basis: ${quoteBasis === "monthly_package" ? "Monthly package" : "Per visit"}`
          : `Base acordada: ${quoteBasis === "monthly_package" ? "Paquete mensual" : "Por visita"}`
        : null;
    const totalLine =
      quoteLayout === "housekeeping" && housekeepingTotals && isRecurring
        ? lang === "en"
          ? `Per visit: ${formatter.format(housekeepingTotals.perVisitCents / 100)} · Monthly package (${housekeepingTotals.visitsPerMonth} visits): ${formatter.format(housekeepingTotals.monthlyPackageCents / 100)} · Applied: ${formatter.format(totalCents / 100)}`
          : `Por visita: ${formatter.format(housekeepingTotals.perVisitCents / 100)} · Paquete mensual (${housekeepingTotals.visitsPerMonth} visitas): ${formatter.format(housekeepingTotals.monthlyPackageCents / 100)} · Aplicado: ${formatter.format(totalCents / 100)}`
        : lang === "en"
          ? `Subtotal: ${formatter.format(totalCents / 100)}`
          : `Subtotal: ${formatter.format(totalCents / 100)}`;
    const disclaimer = (lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ?? "";
    const body = [header, freqLine, basisLine, ...lines, "", totalLine, disclaimer]
      .filter((s) => s !== null && s !== undefined && String(s).length > 0)
      .join("\n");
    setBusy(true);
    try {
      await onInsertAsMessage(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-2 space-y-2">
      <p className="text-[11px] font-bold text-[#78350F]">
        {variant === "buyer"
          ? buyerMenuPickerTitle(providerSlug, lang)
          : lang === "en"
            ? "Build a quote from your menu"
            : "Arma un presupuesto desde tu menú"}
      </p>
      {variant === "buyer" && providerSlug === TRANSPORT_APP_SERVICE && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTransportMode("custom")}
            disabled={disabled || busy}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              transportMode === "custom"
                ? "bg-[#1B4332] text-white border-[#1B4332]"
                : "bg-white text-[#78350F] border-amber-300"
            }`}
          >
            {lang === "en" ? "Custom trip (from / to)" : "Viaje a medida (origen / destino)"}
          </button>
          <button
            type="button"
            onClick={() => setTransportMode("menu")}
            disabled={disabled || busy}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              transportMode === "menu"
                ? "bg-[#1B4332] text-white border-[#1B4332]"
                : "bg-white text-[#78350F] border-amber-300"
            }`}
          >
            {lang === "en" ? "Fixed fare menu" : "Tarifa fija del menú"}
          </button>
        </div>
      )}
      {variant === "buyer" && requiresBuyerContact && (
        <div
          ref={contactSectionRef}
          className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-2 space-y-2"
        >
          <p className="text-[10px] font-bold text-[#1E40AF]">
            {lang === "en" ? "Your contact details (required before quote)" : "Tus datos de contacto (obligatorio antes de la cotización)"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#1E3A8A]">
                {lang === "en" ? "First name" : "Nombre(s)"} *
              </span>
              <input
                type="text"
                value={contactFirstName}
                onChange={(e) => setContactFirstName(e.target.value)}
                disabled={disabled || busy}
                maxLength={80}
                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
              />
            </label>
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#1E3A8A]">
                {lang === "en" ? "Last name" : "Apellido(s)"} *
              </span>
              <input
                type="text"
                value={contactLastName}
                onChange={(e) => setContactLastName(e.target.value)}
                disabled={disabled || busy}
                maxLength={80}
                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
              />
            </label>
          </div>
          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-[#1E3A8A]">
              {lang === "en" ? "Contact phone" : "Teléfono de contacto"} *
            </span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={disabled || busy}
              placeholder={lang === "en" ? "+52 415 123 4567" : "+52 415 123 4567"}
              className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#1E3A8A] cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappDifferent}
              onChange={(e) => setWhatsappDifferent(e.target.checked)}
              disabled={disabled || busy}
              className="accent-[#2563EB]"
            />
            {lang === "en" ? "WhatsApp number is different" : "WhatsApp es otro número"}
          </label>
          {whatsappDifferent ? (
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#1E3A8A]">WhatsApp *</span>
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                disabled={disabled || busy}
                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
              />
            </label>
          ) : null}
          {isTransportCustomRequest ? (
            <>
              <label className="block space-y-0.5">
                <span className="text-[10px] font-semibold text-[#1E3A8A]">
                  {serviceAddressLabel(providerSlug, lang)} *
                </span>
                <textarea
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  disabled={disabled || busy}
                  rows={2}
                  maxLength={240}
                  placeholder={
                    lang === "en" ? "e.g. Centro, SMA — hotel or street address" : "ej. Centro, SMA — hotel o calle"
                  }
                  className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
                />
              </label>
              <label className="block space-y-0.5">
                <span className="text-[10px] font-semibold text-[#1E3A8A]">
                  {dropoffAddressLabel(providerSlug, lang)} *
                </span>
                <textarea
                  value={dropoffAddress}
                  onChange={(e) => setDropoffAddress(e.target.value)}
                  disabled={disabled || busy}
                  rows={2}
                  maxLength={240}
                  placeholder={
                    lang === "en"
                      ? "e.g. Querétaro airport (QRO) or full address"
                      : "ej. Aeropuerto Querétaro (QRO) o dirección completa"
                  }
                  className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
                />
              </label>
            </>
          ) : (
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-[#1E3A8A]">
                {serviceAddressLabel(providerSlug, lang)} *
              </span>
              <textarea
                value={serviceAddress}
                onChange={(e) => setServiceAddress(e.target.value)}
                disabled={disabled || busy}
                rows={2}
                maxLength={500}
                placeholder={
                  lang === "en"
                    ? "Street, number, colonia, city, access instructions…"
                    : "Calle, número, colonia, ciudad, instrucciones de acceso…"
                }
                className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
              />
            </label>
          )}
          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-[#1E3A8A]">
              {preferredDatetimeLabel(providerSlug, lang)} *
            </span>
            <input
              type="datetime-local"
              value={preferredAtLocal}
              onChange={(e) => setPreferredAtLocal(e.target.value)}
              disabled={disabled || busy}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#2563EB] disabled:opacity-50"
            />
          </label>
          {contactErr ? <p className="text-[10px] text-red-600">{contactErr}</p> : null}
        </div>
      )}
      {quickGroups.length > 0 && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-[#92400E]">
            {lang === "en" ? "Quick room counts" : "Cantidades rápidas por cuarto"}
          </p>
          {quickGroups.map((g) => {
            const qty = qtyBySku[g.sku] ?? 0;
            const label = lang === "en" ? g.label_en : g.label_es;
            const item = menu!.items.find((it) => it.sku === g.sku);
            return (
              <div key={g.sku} className="flex items-center gap-2 py-0.5 text-[11px]">
                <span className="min-w-0 flex-1 text-[#1C1917]">{label}</span>
                {item ? (
                  <span className="shrink-0 text-[#6B7280]">
                    {formatter.format(item.price_mxn_cents / 100)}
                  </span>
                ) : null}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => change(g.sku, -1, g.alsoSetSku)}
                    disabled={qty === 0 || disabled}
                    className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                    aria-label="−"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-semibold text-[#78350F]">{qty}</span>
                  <button
                    type="button"
                    onClick={() => change(g.sku, +1, g.alsoSetSku)}
                    disabled={disabled}
                    className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                    aria-label="+"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {quoteLayout === "housekeeping" && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-2 space-y-1.5">
          <label className="block text-[10px] font-semibold text-[#92400E]">
            {lang === "en" ? "Visit frequency" : "Frecuencia de visitas"}
          </label>
          <select
            value={visitFrequency}
            onChange={(e) => {
              const next = e.target.value as HousekeepingVisitFrequency;
              setVisitFrequency(next);
              if (next === "one_time") setQuoteBasis("per_visit");
            }}
            disabled={disabled}
            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-[#1C1917] outline-none focus:border-[#B45309] disabled:opacity-50"
          >
            {HOUSEKEEPING_VISIT_FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>
                {lang === "en" ? f.label_en : f.label_es}
              </option>
            ))}
          </select>
          {housekeepingTotals && housekeepingTotals.perVisitCents > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#78350F]">
                  {lang === "en" ? "Per visit" : "Por visita"}
                </span>
                <span className="font-semibold text-[#78350F]">
                  {formatter.format(housekeepingTotals.perVisitCents / 100)}
                </span>
              </div>
              {isRecurring && (
                <>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#78350F]">
                      {lang === "en"
                        ? `Monthly package (${housekeepingTotals.visitsPerMonth} visits)`
                        : `Paquete mensual (${housekeepingTotals.visitsPerMonth} visitas)`}
                    </span>
                    <span className="font-semibold text-[#78350F]">
                      {formatter.format(housekeepingTotals.monthlyPackageCents / 100)}
                    </span>
                  </div>
                  <fieldset className="space-y-1">
                    <legend className="text-[10px] font-semibold text-[#92400E]">
                      {lang === "en" ? "Apply to agreed price" : "Aplicar al precio acordado"}
                    </legend>
                    <label className="flex items-center gap-2 text-[11px] text-[#1C1917] cursor-pointer">
                      <input
                        type="radio"
                        name="quote-basis"
                        checked={quoteBasis === "per_visit"}
                        onChange={() => setQuoteBasis("per_visit")}
                        disabled={disabled}
                        className="accent-[#B45309]"
                      />
                      {lang === "en" ? "Per visit amount" : "Monto por visita"}
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-[#1C1917] cursor-pointer">
                      <input
                        type="radio"
                        name="quote-basis"
                        checked={quoteBasis === "monthly_package"}
                        onChange={() => setQuoteBasis("monthly_package")}
                        disabled={disabled}
                        className="accent-[#B45309]"
                      />
                      {lang === "en" ? "Monthly package total" : "Total paquete mensual"}
                    </label>
                  </fieldset>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {!isTransportCustomRequest ? (
      <div className="max-h-44 overflow-y-auto divide-y divide-amber-100">
        {menu.items.map((it) => {
          const qty = qtyBySku[it.sku] ?? 0;
          const label = (lang === "en" && it.name_en) || it.name_es;
          return (
            <div key={it.sku} className="flex items-center gap-2 py-1.5 text-[11px]">
              <span className="min-w-0 flex-1 text-[#1C1917]">{label}</span>
              <span className="shrink-0 text-[#6B7280]">
                {formatter.format(it.price_mxn_cents / 100)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => change(it.sku, -1)}
                  disabled={qty === 0 || disabled}
                  className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                  aria-label="−"
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold text-[#78350F]">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => change(it.sku, +1)}
                  disabled={disabled}
                  className="w-5 h-5 rounded border border-amber-300 text-[#78350F] disabled:opacity-30"
                  aria-label="+"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        <p className="text-[10px] text-[#92400E] leading-snug">
          {lang === "en"
            ? "The driver will confirm the fare for your route after you send this request."
            : "El conductor confirmará la tarifa de tu ruta después de enviar esta solicitud."}
        </p>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-amber-200">
        <span className="text-[11px] text-[#78350F]">
          {quoteLayout === "housekeeping" && isRecurring
            ? quoteBasis === "monthly_package"
              ? lang === "en"
                ? "Monthly package (agreed)"
                : "Paquete mensual (acordado)"
              : lang === "en"
                ? "Per visit (agreed)"
                : "Por visita (acordado)"
            : lang === "en"
              ? "Quote subtotal"
              : "Subtotal de la cotización"}
        </span>
        <span className="text-sm font-bold text-[#78350F]">
          {formatter.format(totalCents / 100)}
        </span>
      </div>
      {variant === "buyer" && (
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold text-[#92400E]">
            {lang === "en" ? "Notes (optional)" : "Notas (opcional)"}
          </span>
          <textarea
            value={buyerNotes}
            onChange={(e) => setBuyerNotes(e.target.value)}
            disabled={disabled || busy}
            rows={2}
            maxLength={500}
            placeholder={
              lang === "en"
                ? "Access instructions, pets, preferred day…"
                : "Instrucciones de acceso, mascotas, día preferido…"
            }
            className="w-full rounded-lg border border-amber-200 px-2 py-1.5 text-[11px] text-[#1C1917] outline-none focus:border-[#B45309] disabled:opacity-50"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {officialQuoteFlow ? (
          <p className="text-[10px] text-[#065F46] leading-snug w-full">
            {lang === "en"
              ? "Use the green button so the customer gets Accept / Decline and WhatsApp — not «Send as message»."
              : "Usa el botón verde para que el cliente reciba Aceptar / Rechazar y WhatsApp — no «Enviar al chat»."}
          </p>
        ) : null}
        {variant === "seller" && onSendOfficialQuote ? (
          <button
            type="button"
            onClick={() => void sendOfficialQuote()}
            disabled={applyDisabled}
            className="flex-1 min-w-[140px] rounded-lg bg-[#1B4332] text-white text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
          >
            {busy
              ? "…"
              : lang === "en"
                ? "Send quote to customer"
                : "Enviar cotización al cliente"}
          </button>
        ) : null}
        {variant === "buyer" && onSubmitRequest ? (
          <button
            type="button"
            onClick={() => void submitRequest()}
            disabled={applyDisabled}
            className="flex-1 min-w-[140px] rounded-lg bg-[#1B4332] text-white text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
          >
            {busy
              ? "…"
              : lang === "en"
                ? "Send request to provider"
                : "Enviar solicitud al proveedor"}
          </button>
        ) : null}
      {submitErr ? (
        <p className="text-[11px] font-semibold text-red-600 leading-snug" role="alert">
          {submitErr}
        </p>
      ) : null}
        {variant === "seller" && onApplyTotal && !officialQuoteFlow ? (
          <button
            type="button"
            onClick={applyToAgreedPrice}
            disabled={applyDisabled}
            className="flex-1 min-w-[120px] rounded-lg bg-[#B45309] text-white text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
          >
            {lang === "en" ? "Apply to agreed price" : "Aplicar al precio acordado"}
          </button>
        ) : null}
        {variant === "seller" && onInsertAsMessage && !officialQuoteFlow && (
          <button
            type="button"
            onClick={() => void insertAsMessage()}
            disabled={applyDisabled}
            className="rounded-lg border border-amber-300 text-[#78350F] text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
          >
            {lang === "en" ? "Send as message" : "Enviar al chat"}
          </button>
        )}
        <button
          type="button"
          onClick={clearAll}
          disabled={selectedLines.length === 0 || disabled}
          className="rounded-lg border border-amber-200 text-[#92400E] text-[11px] font-semibold px-2 py-1.5 disabled:opacity-40"
        >
          {lang === "en" ? "Clear" : "Limpiar"}
        </button>
      </div>
      <p className="text-[10px] italic text-[#92400E] leading-snug">
        {(lang === "en" ? menu.disclaimer_en : menu.disclaimer_es) ??
          (lang === "en"
            ? "Price may change after physical inspection of the garment."
            : "El precio puede ajustarse al revisar la prenda físicamente.")}
      </p>
    </div>
  );
}
