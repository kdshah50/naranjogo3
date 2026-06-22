import {
  canonicalizeAuthPhone,
  isValidAuthPhone,
  normalizeAuthPhone,
} from "@/lib/phone";
import type { ServiceQuoteMetadata } from "@/lib/service-quote";

export type BuyerQuoteContact = {
  firstName: string;
  lastName: string;
  contactPhone: string;
  whatsappPhone: string | null;
  serviceAddress: string;
  /** ISO 8601 datetime for preferred visit */
  preferredAt: string;
};

export function normalizeContactPhoneInput(raw: string): string | null {
  let digits = canonicalizeAuthPhone(normalizeAuthPhone(String(raw ?? "").trim()));
  // Bare 10-digit national numbers → Mexico +52 (primary market), same as auth signup.
  if (/^\d{10}$/.test(digits)) {
    digits = `52${digits}`;
  }
  return isValidAuthPhone(digits) ? digits : null;
}

export function validateBuyerQuoteContact(
  raw: Partial<BuyerQuoteContact>,
  lang: "es" | "en" = "es",
): string | null {
  const es = lang === "es";
  const firstName = String(raw.firstName ?? "").trim();
  const lastName = String(raw.lastName ?? "").trim();
  const serviceAddress = String(raw.serviceAddress ?? "").trim();
  const preferredAt = String(raw.preferredAt ?? "").trim();

  if (firstName.length < 1 || firstName.length > 80) {
    return es ? "Nombre(s) requerido (máx. 80 caracteres)." : "First name required (max 80 characters).";
  }
  if (lastName.length < 1 || lastName.length > 80) {
    return es ? "Apellido(s) requerido (máx. 80 caracteres)." : "Last name required (max 80 characters).";
  }
  if (!normalizeContactPhoneInput(String(raw.contactPhone ?? ""))) {
    return es
      ? "Teléfono de contacto inválido (México 10 dígitos o +52…; EE.UU. +1…)."
      : "Invalid contact phone (Mexico 10 digits or +52…; US +1…).";
  }
  const waRaw = String(raw.whatsappPhone ?? "").trim();
  if (waRaw && !normalizeContactPhoneInput(waRaw)) {
    return es ? "WhatsApp inválido si es distinto al teléfono." : "Invalid WhatsApp number if different from phone.";
  }
  if (serviceAddress.length < 8 || serviceAddress.length > 500) {
    return es
      ? "Dirección del servicio requerida (mín. 8 caracteres)."
      : "Service address required (min 8 characters).";
  }
  if (!preferredAt) {
    return es ? "Elige día y hora preferidos para la visita." : "Choose preferred visit day and time.";
  }
  const when = new Date(preferredAt);
  if (Number.isNaN(when.getTime())) {
    return es ? "Fecha y hora preferidas inválidas." : "Invalid preferred date and time.";
  }
  return null;
}

export function parseBuyerQuoteContactFromBody(raw: unknown): BuyerQuoteContact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const contactPhone = normalizeContactPhoneInput(String(o.contactPhone ?? ""));
  if (!contactPhone) return null;
  const waRaw = String(o.whatsappPhone ?? "").trim();
  const whatsappPhone = waRaw ? normalizeContactPhoneInput(waRaw) : null;
  if (waRaw && !whatsappPhone) return null;

  const candidate: Partial<BuyerQuoteContact> = {
    firstName: String(o.firstName ?? "").trim(),
    lastName: String(o.lastName ?? "").trim(),
    contactPhone,
    whatsappPhone,
    serviceAddress: String(o.serviceAddress ?? "").trim(),
    preferredAt: String(o.preferredAt ?? "").trim(),
  };
  if (validateBuyerQuoteContact(candidate, "es")) return null;

  return candidate as BuyerQuoteContact;
}

export function buyerContactFromMetadata(meta: ServiceQuoteMetadata | null | undefined): BuyerQuoteContact | null {
  if (!meta?.buyerFirstName || !meta.buyerLastName || !meta.contactPhone || !meta.serviceAddress || !meta.preferredAt) {
    return null;
  }
  return {
    firstName: meta.buyerFirstName,
    lastName: meta.buyerLastName,
    contactPhone: meta.contactPhone,
    whatsappPhone: meta.whatsappPhone ?? null,
    serviceAddress: meta.serviceAddress,
    preferredAt: meta.preferredAt,
  };
}

/** Rebook prefill — contact fields only; preferred date must be chosen again. */
export function buyerContactPrefillFromMetadata(
  meta: ServiceQuoteMetadata | null | undefined,
): Partial<BuyerQuoteContact> | null {
  if (!meta?.buyerFirstName || !meta.buyerLastName || !meta.contactPhone || !meta.serviceAddress) {
    return null;
  }
  return {
    firstName: meta.buyerFirstName,
    lastName: meta.buyerLastName,
    contactPhone: meta.contactPhone,
    whatsappPhone: meta.whatsappPhone ?? null,
    serviceAddress: meta.serviceAddress,
  };
}

export function metadataFromBuyerContact(c: BuyerQuoteContact): Pick<
  ServiceQuoteMetadata,
  | "buyerFirstName"
  | "buyerLastName"
  | "contactPhone"
  | "whatsappPhone"
  | "serviceAddress"
  | "preferredAt"
> {
  return {
    buyerFirstName: c.firstName,
    buyerLastName: c.lastName,
    contactPhone: c.contactPhone,
    whatsappPhone: c.whatsappPhone,
    serviceAddress: c.serviceAddress,
    preferredAt: c.preferredAt,
  };
}

function formatPhoneDisplay(digits: string): string {
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}

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

/** Block appended to cleaning request chat message for provider visibility. */
export function formatBuyerContactBlock(c: BuyerQuoteContact, lang: "es" | "en" = "es"): string {
  const es = lang === "es";
  const wa =
    c.whatsappPhone && c.whatsappPhone !== c.contactPhone
      ? formatPhoneDisplay(c.whatsappPhone)
      : null;
  return [
    es ? "👤 Datos del cliente:" : "👤 Customer details:",
    `${es ? "Nombre" : "Name"}: ${c.firstName} ${c.lastName}`,
    `${es ? "Teléfono" : "Phone"}: ${formatPhoneDisplay(c.contactPhone)}`,
    wa ? `${es ? "WhatsApp" : "WhatsApp"}: ${wa}` : null,
    `${es ? "Dirección del servicio" : "Service address"}: ${c.serviceAddress}`,
    `${es ? "Día y hora preferidos" : "Preferred day & time"}: ${formatPreferredAt(c.preferredAt, lang)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
