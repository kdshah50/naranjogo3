import { COLONIAS, coloniaLabel } from "@/lib/colonias";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import {
  type DriverSignupInput,
} from "@/lib/rides/driver-validators";

export type { DriverSignupInput, DriverSignupValidation } from "@/lib/rides/driver-validators";
export {
  isValidLicenseNumber,
  isValidVehiclePlates,
  isValidVehicleYear,
  normalizeLicenseNumber,
  normalizePlates,
  sanitizeServiceColonias,
  validateDriverSignup,
} from "@/lib/rides/driver-validators";

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_NUMBER ?? "";
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM ?? "";

export async function findOrCreateUserByPhone(args: {
  phone: string;
  displayName: string;
  curp?: string;
  rfc?: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: unknown }> {
  const SUPA_URL = getSupabaseUrl();
  const h = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" as const };
  const phone = args.phone.replace(/\s/g, "");

  const userRes = await fetch(
    `${SUPA_URL}/rest/v1/users?phone=eq.${encodeURIComponent(phone)}&select=id`,
    { headers: h },
  );
  const existingUsers = userRes.ok ? await userRes.json() : [];

  if (existingUsers.length > 0) {
    const userId = existingUsers[0].id as string;
    const patch: Record<string, string> = {};
    if (args.curp) patch.curp = args.curp;
    if (args.rfc) patch.rfc = args.rfc;
    if (Object.keys(patch).length > 0) {
      await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${userId}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
    return { ok: true, userId };
  }

  const userPayload: Record<string, unknown> = {
    phone,
    display_name: args.displayName,
    trust_badge: "none",
  };
  if (args.curp) userPayload.curp = args.curp;
  if (args.rfc) userPayload.rfc = args.rfc;

  const newUserRes = await fetch(`${SUPA_URL}/rest/v1/users`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify(userPayload),
  });
  if (!newUserRes.ok) {
    return { ok: false, error: await newUserRes.json().catch(() => ({})) };
  }
  const newUser = await newUserRes.json();
  const userId = newUser[0]?.id as string | undefined;
  if (!userId) return { ok: false, error: "Failed to create user" };
  return { ok: true, userId };
}

export function buildDriverListingPayload(input: DriverSignupInput, sellerId: string) {
  const coloniaKey = input.primary_colonia || "otro";
  const coloniaData = COLONIAS[coloniaKey] ?? COLONIAS.otro;
  const coloniaLabelEs = coloniaData.label;
  const coloniaLabelEn = coloniaLabel(coloniaKey, "en");
  const locationCity = `${coloniaLabelEs}, San Miguel de Allende`;
  const zonesEs = input.service_colonias
    .map((k) => COLONIAS[k]?.label ?? k)
    .join(", ");
  const vehicleLine = `${input.vehicle_color} ${input.vehicle_make} ${input.vehicle_model} ${input.vehicle_year} · ${input.vehicle_plates}`;
  const baseDesc =
    input.description ||
    `Conductor verificado en Naranjogo. Vehículo: ${vehicleLine}. Zonas: ${zonesEs}.`;

  return {
    seller_id: sellerId,
    title_es: `Transporte / Taxi — ${coloniaLabelEs}, SMA`,
    title_en: `Ride / Taxi — ${coloniaLabelEn}, SMA`,
    description_es: `${baseDesc}\n\nZonas de servicio: ${zonesEs}.`,
    description_en: `${baseDesc}\n\nService areas: ${zonesEs}.`,
    price_mxn: 8000,
    category_id: "services",
    subcategory_kind: "ride",
    condition: "new",
    status: "active",
    is_verified: false,
    location_city: locationCity,
    location_state: "Guanajuato",
    zip_code: "37745",
    location_lat: coloniaData.lat,
    location_lng: coloniaData.lng,
    shipping_available: false,
    negotiable: false,
    photo_urls: [],
    payment_methods: ["naranjogo_wallet"],
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function buildDriverProfileRow(input: DriverSignupInput, userId: string) {
  return {
    user_id: userId,
    license_number: input.license_number,
    license_expiry: input.license_expiry,
    license_photo_url: input.license_photo_url,
    vehicle_make: input.vehicle_make,
    vehicle_model: input.vehicle_model,
    vehicle_year: input.vehicle_year,
    vehicle_color: input.vehicle_color,
    vehicle_plates: input.vehicle_plates,
    vehicle_card_photo_url: input.vehicle_card_photo_url,
    insurance_provider: input.insurance_provider,
    insurance_policy: input.insurance_policy,
    insurance_expiry: input.insurance_expiry,
    insurance_photo_url: input.insurance_photo_url,
    service_colonias: input.service_colonias,
    background_check_status: "none",
    is_active_driver: false,
    updated_at: new Date().toISOString(),
  };
}

export async function notifyAdminNewDriver(form: {
  name: string;
  whatsapp: string;
  vehicle: string;
  plates: string;
  colonias: string;
  curp?: string;
  rfc?: string;
  accepted_at?: string;
}) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !ADMIN_WHATSAPP || !TWILIO_FROM) return;
  try {
    const msg = [
      `🚕 *Naranjogo — Nuevo conductor*`,
      `👤 ${form.name}`,
      `📱 ${form.whatsapp}`,
      `🚗 ${form.vehicle}`,
      `🔢 Placas: ${form.plates}`,
      `📍 Zonas: ${form.colonias}`,
      ...(form.curp ? [`🪪 CURP: ${form.curp}`] : []),
      ...(form.rfc ? [`📋 RFC: ${form.rfc}`] : []),
      ``,
      `✅ Términos: ${form.accepted_at ?? "sí"}`,
      ``,
      `→ Aprueba en Supabase:`,
      `   listings.is_verified = true`,
      `   driver_profiles.is_active_driver = true`,
    ].join("\n");

    const body = new URLSearchParams({
      From: `whatsapp:${TWILIO_FROM}`,
      To: `whatsapp:${ADMIN_WHATSAPP}`,
      Body: msg,
    });
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (e) {
    console.error("[driver-signup] WhatsApp notify failed:", e);
  }
}
