import { COLONIAS } from "@/lib/colonias";
import { normalizeCurpForStorage, normalizeRfcForStorage } from "@/lib/mx-tax-ids";

export type DriverSignupInput = {
  name: string;
  whatsapp: string;
  curp?: string;
  rfc?: string;
  license_number: string;
  license_expiry: string;
  license_photo_url: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_color: string;
  vehicle_plates: string;
  vehicle_card_photo_url: string;
  insurance_provider: string;
  insurance_policy: string;
  insurance_expiry: string;
  insurance_photo_url: string;
  service_colonias: string[];
  primary_colonia: string;
  description?: string;
  accepted_terms: boolean;
  accepted_pricing: boolean;
  accepted_at?: string;
};

export type DriverSignupValidation =
  | { ok: true; data: DriverSignupInput }
  | { ok: false; error: string };

const PLATE_RE = /^[A-Z0-9]{5,9}$/;
const LICENSE_RE = /^[A-Z0-9\- ]{5,24}$/i;

export function normalizePlates(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

export function isValidVehiclePlates(raw: string): boolean {
  const n = normalizePlates(raw);
  return PLATE_RE.test(n);
}

export function normalizeLicenseNumber(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function isValidLicenseNumber(raw: string): boolean {
  const n = normalizeLicenseNumber(raw);
  return LICENSE_RE.test(n);
}

export function isValidVehicleYear(year: number, now = new Date()): boolean {
  if (!Number.isInteger(year)) return false;
  const max = now.getFullYear() + 1;
  return year >= 1985 && year <= max;
}

function parseIsoDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return s;
}

function isFutureDate(isoDate: string, now = new Date()): boolean {
  const d = new Date(`${isoDate}T23:59:59.999Z`);
  return d.getTime() >= now.getTime();
}

export function sanitizeServiceColonias(raw: unknown, primaryColonia: string): string[] {
  const keys = new Set<string>();
  const primary = String(primaryColonia ?? "").trim();
  if (primary && COLONIAS[primary]) keys.add(primary);

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const k = String(item ?? "").trim();
      if (k && COLONIAS[k]) keys.add(k);
    }
  }

  if (keys.size === 0 && COLONIAS.otro) keys.add("otro");
  return [...keys];
}

export function validateDriverSignup(body: Record<string, unknown>): DriverSignupValidation {
  const name = String(body.name ?? "").trim();
  const whatsapp = String(body.whatsapp ?? "").replace(/\s/g, "");
  const license_number = normalizeLicenseNumber(String(body.license_number ?? ""));
  const license_expiry = parseIsoDate(String(body.license_expiry ?? ""));
  const vehicle_make = String(body.vehicle_make ?? "").trim();
  const vehicle_model = String(body.vehicle_model ?? "").trim();
  const vehicle_year = Math.round(Number(body.vehicle_year));
  const vehicle_color = String(body.vehicle_color ?? "").trim();
  const vehicle_plates = normalizePlates(String(body.vehicle_plates ?? ""));
  const insurance_provider = String(body.insurance_provider ?? "").trim();
  const insurance_policy = String(body.insurance_policy ?? "").trim();
  const insurance_expiry = parseIsoDate(String(body.insurance_expiry ?? ""));
  const license_photo_url = String(body.license_photo_url ?? "").trim();
  const vehicle_card_photo_url = String(body.vehicle_card_photo_url ?? "").trim();
  const insurance_photo_url = String(body.insurance_photo_url ?? "").trim();
  const primary_colonia = String(body.colonia ?? body.primary_colonia ?? "otro").trim();
  const description = String(body.description ?? "").trim();
  const accepted_terms = Boolean(body.accepted_terms);
  const accepted_pricing = Boolean(body.accepted_pricing);
  const accepted_at = String(body.accepted_at ?? new Date().toISOString());

  if (!name || !whatsapp) {
    return { ok: false, error: "Nombre y WhatsApp son obligatorios" };
  }
  if (!accepted_terms || !accepted_pricing) {
    return { ok: false, error: "Debes aceptar los términos para continuar" };
  }
  if (!isValidLicenseNumber(license_number)) {
    return { ok: false, error: "Número de licencia inválido" };
  }
  if (!license_expiry || !isFutureDate(license_expiry)) {
    return { ok: false, error: "La licencia debe tener una fecha de vencimiento futura válida" };
  }
  if (!vehicle_make || !vehicle_model || !vehicle_color) {
    return { ok: false, error: "Marca, modelo y color del vehículo son obligatorios" };
  }
  if (!isValidVehicleYear(vehicle_year)) {
    return { ok: false, error: "Año del vehículo inválido" };
  }
  if (!isValidVehiclePlates(vehicle_plates)) {
    return { ok: false, error: "Placas inválidas (5–9 caracteres alfanuméricos)" };
  }
  if (!insurance_provider || !insurance_policy) {
    return { ok: false, error: "Seguro: proveedor y póliza son obligatorios" };
  }
  if (!insurance_expiry || !isFutureDate(insurance_expiry)) {
    return { ok: false, error: "El seguro debe tener una fecha de vencimiento futura válida" };
  }
  if (!license_photo_url || !vehicle_card_photo_url || !insurance_photo_url) {
    return { ok: false, error: "Sube las tres fotos requeridas (licencia, tarjeta de circulación, póliza)" };
  }

  const service_colonias = sanitizeServiceColonias(body.service_colonias, primary_colonia);

  return {
    ok: true,
    data: {
      name,
      whatsapp,
      curp: normalizeCurpForStorage(String(body.curp ?? "")),
      rfc: normalizeRfcForStorage(String(body.rfc ?? "")),
      license_number,
      license_expiry,
      license_photo_url,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vehicle_color,
      vehicle_plates,
      vehicle_card_photo_url,
      insurance_provider,
      insurance_policy,
      insurance_expiry,
      insurance_photo_url,
      service_colonias,
      primary_colonia,
      description,
      accepted_terms,
      accepted_pricing,
      accepted_at,
    },
  };
}
