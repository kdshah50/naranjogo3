import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMxnFromCents } from "@/lib/rides/ride-pricing";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { getPublicAppUrl } from "@/lib/app-url";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { canonicalizeAuthPhone, normalizeAuthPhone } from "@/lib/phone";
import { expandUserAccountIdPool, phoneLookupVariants } from "@/lib/user-account-pool";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";

export function rideBuyerViajeUrl(rideId?: string | null): string {
  const base = `${getPublicAppUrl()}/viaje`;
  if (!rideId) return base;
  return `${base}?ride=${encodeURIComponent(rideId)}`;
}

export function rideDriverPanelUrl(rideId?: string | null): string {
  const base = `${getPublicAppUrl()}/conductor/viajes`;
  if (!rideId) return base;
  return `${base}?ride=${encodeURIComponent(rideId)}`;
}

export async function findUserPhoneById(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const pool = await expandUserAccountIdPool(supabase, userId);
  const ids = pool.length > 0 ? pool : idMatchVariantsForIn(userId);
  const { data: rows } = await supabase.from("users").select("phone").in("id", ids);
  for (const row of rows ?? []) {
    const raw = String(row.phone ?? "").trim();
    if (!raw) continue;
    const digits = canonicalizeAuthPhone(normalizeAuthPhone(raw));
    if (digits) return digits;
  }
  return null;
}

export async function notifyBuyerRideCreated(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; matched: boolean }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const fare = formatMxnFromCents(args.ride.estimated_total_mxn_cents);
  const hold = formatMxnFromCents(args.ride.hold_amount_mxn_cents);
  const viajeUrl = rideBuyerViajeUrl(args.ride.id);
  let msg =
    `🚕 *Solicitud de viaje recibida*\n` +
    `Origen: ${args.ride.pickup_address}\n` +
    `Destino: ${args.ride.dropoff_address}\n` +
    `Tarifa estimada: *${fare}* (reserva ${hold})\n`;

  if (args.matched && args.ride.ticket_code) {
    msg +=
      `\nConductor asignado. Tu código de viaje: *${args.ride.ticket_code}*\n` +
      `Muéstralo al conductor al subir.\n\n` +
      `Abre tu viaje en la app:\n${viajeUrl}`;
  } else if (!args.matched) {
    msg += `\nBuscando conductor… Te avisaremos cuando haya match.\n\n${viajeUrl}`;
  } else {
    msg += `\n\n${viajeUrl}`;
  }

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyBuyerTripStarted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id);
  const msg =
    `🚕 *Viaje en curso*\n` +
    `Tu viaje comenzó hacia el destino.\n` +
    `Destino: ${args.ride.dropoff_address}\n` +
    `Ticket: *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Sigue el estado:\n${viajeUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyBuyerRideArrived(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id);
  const msg =
    `🚕 *Conductor en el origen*\n` +
    `Ya está en tu punto de recogida.\n` +
    `Origen: ${args.ride.pickup_address}\n` +
    `Ticket: *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Muéstrale el código al subir.\n${viajeUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyDriverRideMatched(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; driverUserId: string }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.driverUserId);
  if (!phone) return;

  const fare = formatMxnFromCents(args.ride.estimated_total_mxn_cents);
  const panelUrl = rideDriverPanelUrl(args.ride.id);
  const msg =
    `🚕 *Nuevo viaje asignado*\n` +
    `Recoger: ${args.ride.pickup_address}\n` +
    `Destino: ${args.ride.dropoff_address}\n` +
    `Tarifa est.: *${fare}*\n` +
    `Ticket pasajero: *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Acepta el viaje en la app (Conectar si estás fuera de línea):\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyBuyerRideCompleted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; finalTotalMxnCents: number }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const fare = formatMxnFromCents(args.finalTotalMxnCents);
  const viajeUrl = rideBuyerViajeUrl(args.ride.id);
  const msg =
    `🚕 *Viaje completado*\n` +
    `Gracias por viajar con NaranjoGo.\n` +
    `Cargo en tu saldo: *${fare}*\n` +
    `Ruta: ${args.ride.pickup_address} → ${args.ride.dropoff_address}\n\n` +
    `Detalle y propina:\n${viajeUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyDriverRideCompleted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; driverUserId: string; driverPayoutMxnCents: number }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.driverUserId);
  if (!phone) return;

  const fare = formatMxnFromCents(args.ride.final_total_mxn_cents ?? args.ride.estimated_total_mxn_cents);
  const payout = formatMxnFromCents(args.driverPayoutMxnCents);
  const panelUrl = rideDriverPanelUrl();
  const msg =
    `🚕 *Viaje completado*\n` +
    `Pasajero: ticket *${args.ride.ticket_code ?? "—"}*\n` +
    `Tarifa: *${fare}* · Tu pago: *${payout}*\n` +
    `${args.ride.pickup_address} → ${args.ride.dropoff_address}\n\n` +
    `Panel:\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyBuyerRideAccepted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id);
  const msg =
    `🚕 *Conductor en camino*\n` +
    `Tu viaje fue aceptado.\n` +
    `Origen: ${args.ride.pickup_address}\n` +
    `Ticket: *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Sigue el estado en la app:\n${viajeUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyDriverRideAccepted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; driverUserId: string }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.driverUserId);
  if (!phone) return;

  const panelUrl = rideDriverPanelUrl(args.ride.id);
  const msg =
    `🚕 *Viaje aceptado*\n` +
    `Ticket *${args.ride.ticket_code ?? "—"}* — ve al origen.\n` +
    `${args.ride.pickup_address}\n\n` +
    `Siguiente paso: «Llegué al origen»\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyDriverRideArrived(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; driverUserId: string }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.driverUserId);
  if (!phone) return;

  const panelUrl = rideDriverPanelUrl();
  const msg =
    `🚕 *En el origen*\n` +
    `Ticket *${args.ride.ticket_code ?? "—"}* — pide el código al pasajero.\n\n` +
    `Siguiente paso: «Iniciar viaje»\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export async function notifyDriverTripStarted(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; driverUserId: string }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const phone = await findUserPhoneById(supabase, args.driverUserId);
  if (!phone) return;

  const panelUrl = rideDriverPanelUrl(args.ride.id);
  const msg =
    `🚕 *Viaje en curso*\n` +
    `Destino: ${args.ride.dropoff_address}\n` +
    `Ticket *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Al llegar: «Completar viaje»\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export type RideNotifyPhase = "accepted" | "arrived" | "in_trip" | "completed";

/** Fire buyer + driver WhatsApp for a lifecycle step (after DB commit). */
export async function emitRidePhaseNotifications(
  supabase: SupabaseClient,
  args: {
    ride: RideBookingRow;
    phase: RideNotifyPhase;
    driverUserId: string;
    finalTotalMxnCents?: number;
    driverPayoutMxnCents?: number;
  },
): Promise<void> {
  const { ride, phase, driverUserId } = args;
  try {
    if (phase === "accepted") {
      await notifyBuyerRideAccepted(supabase, { ride });
      await notifyDriverRideAccepted(supabase, { ride, driverUserId });
    } else if (phase === "arrived") {
      await notifyBuyerRideArrived(supabase, { ride });
      await notifyDriverRideArrived(supabase, { ride, driverUserId });
    } else if (phase === "in_trip") {
      await notifyBuyerTripStarted(supabase, { ride });
      await notifyDriverTripStarted(supabase, { ride, driverUserId });
    } else if (phase === "completed") {
      const fare = args.finalTotalMxnCents ?? ride.final_total_mxn_cents ?? ride.estimated_total_mxn_cents;
      await notifyBuyerRideCompleted(supabase, { ride, finalTotalMxnCents: fare });
      await notifyDriverRideCompleted(supabase, {
        ride,
        driverUserId,
        driverPayoutMxnCents: args.driverPayoutMxnCents ?? 0,
      });
    }
  } catch (e) {
    console.error("[ride-notify] emitRidePhaseNotifications", phase, e);
  }
}

export function extractTwilioPhone(fromField: string): string {
  const raw = String(fromField ?? "").replace(/^whatsapp:/i, "").trim();
  return canonicalizeAuthPhone(normalizeAuthPhone(raw));
}

export async function findUserIdByPhone(
  supabase: SupabaseClient,
  phoneDigits: string
): Promise<string | null> {
  for (const variant of phoneLookupVariants(phoneDigits)) {
    const { data } = await supabase.from("users").select("id").eq("phone", variant).limit(1);
    if (data?.[0]?.id) return String(data[0].id).toLowerCase();
  }
  return null;
}

export function twimlMessage(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
