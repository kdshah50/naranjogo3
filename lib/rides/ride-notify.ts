import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMxnFromCents } from "@/lib/rides/ride-pricing";
import { applyEventTruthToRide, getRideById, type RideBookingRow } from "@/lib/rides/ride-bookings-server";
import { rideStatusRank } from "@/lib/rides/ride-status-merge";
import { getPublicAppUrl } from "@/lib/app-url";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { expandUserAccountIdPool, phoneLookupVariants } from "@/lib/user-account-pool";
import { idMatchVariantsForIn, sortRowsWithPreferredUserId } from "@/lib/user-id-variants";

export function rideBuyerViajeUrl(
  rideId?: string | null,
  ticketCode?: string | null,
): string {
  const base = `${getPublicAppUrl()}/viaje`;
  const ticket = String(ticketCode ?? "").trim();
  if (ticket) {
    return `${base}?ticket=${encodeURIComponent(ticket)}`;
  }
  const id = String(rideId ?? "").trim();
  if (id) return `${base}?ride=${encodeURIComponent(id)}`;
  return base;
}

export function rideDriverPanelUrl(
  rideId?: string | null,
  ticketCode?: string | null,
): string {
  const base = `${getPublicAppUrl()}/conductor/viajes`;
  const qs = new URLSearchParams();
  const id = String(rideId ?? "").trim();
  const ticket = String(ticketCode ?? "").trim();
  if (id) qs.set("ride", id);
  if (ticket) qs.set("ticket", ticket);
  const suffix = qs.toString();
  return suffix ? `${base}?${suffix}` : base;
}

/** Same user as buyer and driver (E2E shortcut) — skip buyer WhatsApp to avoid duplicate spam. */
export function isSelfRide(
  ride: Pick<RideBookingRow, "buyer_id" | "driver_id">,
  driverUserId?: string | null,
): boolean {
  const buyer = String(ride.buyer_id ?? "").trim().toLowerCase();
  const driver = String(driverUserId ?? ride.driver_id ?? "").trim().toLowerCase();
  return Boolean(buyer && driver && buyer === driver);
}

export async function findUserPhoneById(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const pool = await expandUserAccountIdPool(supabase, userId);
  const ids = pool.length > 0 ? pool : idMatchVariantsForIn(userId);
  const { data: rowsRaw } = await supabase.from("users").select("id,phone").in("id", ids);
  const rows = sortRowsWithPreferredUserId(rowsRaw ?? [], userId);
  for (const row of rows) {
    const digits = e164DigitsForWhatsAppRecipient(row?.phone);
    if (digits) return digits;
  }
  return null;
}

export async function notifyBuyerRideCreated(
  supabase: SupabaseClient,
  args: { ride: RideBookingRow; matched: boolean }
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  if (isSelfRide(args.ride)) {
    console.warn("[ride-notify] buyer WhatsApp skipped — self-ride (buyer is driver)", {
      rideId: args.ride.id.slice(0, 8),
      step: "created",
    });
    return;
  }

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) {
    console.warn("[ride-notify] buyer WhatsApp skipped — no phone", {
      rideId: args.ride.id.slice(0, 8),
      buyerId: String(args.ride.buyer_id).slice(0, 8),
      step: "created",
    });
    return;
  }

  const fare = formatMxnFromCents(args.ride.estimated_total_mxn_cents);
  const hold = formatMxnFromCents(args.ride.hold_amount_mxn_cents);
  const viajeUrl = rideBuyerViajeUrl(args.ride.id, args.ride.ticket_code);
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
  if (isSelfRide(args.ride)) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id, args.ride.ticket_code);
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
  if (isSelfRide(args.ride)) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id, args.ride.ticket_code);
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
  const panelUrl = rideDriverPanelUrl(args.ride.id, args.ride.ticket_code);
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
  if (isSelfRide(args.ride)) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const fare = formatMxnFromCents(args.finalTotalMxnCents);
  const viajeUrl = rideBuyerViajeUrl(args.ride.id, args.ride.ticket_code);
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
  if (isSelfRide(args.ride)) return;

  const phone = await findUserPhoneById(supabase, args.ride.buyer_id);
  if (!phone) return;

  const viajeUrl = rideBuyerViajeUrl(args.ride.id, args.ride.ticket_code);
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

  const panelUrl = rideDriverPanelUrl(args.ride.id, args.ride.ticket_code);
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

  const panelUrl = rideDriverPanelUrl(args.ride.id, args.ride.ticket_code);
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

  const panelUrl = rideDriverPanelUrl(args.ride.id, args.ride.ticket_code);
  const msg =
    `🚕 *Viaje en curso*\n` +
    `Destino: ${args.ride.dropoff_address}\n` +
    `Ticket *${args.ride.ticket_code ?? "—"}*\n\n` +
    `Al llegar: «Completar viaje»\n${panelUrl}`;

  await sendWhatsAppToE164Digits(phone, msg);
}

export type RideNotifyPhase = "accepted" | "arrived" | "in_trip" | "completed";

const PHASE_WHATSAPP_COPY: Record<
  RideNotifyPhase,
  { title: string; riderNext: string; driverNext: string }
> = {
  accepted: {
    title: "Viaje aceptado · conductor en camino",
    riderNext: "Sigue tu viaje",
    driverNext: "Ve al origen · «Llegué al origen»",
  },
  arrived: {
    title: "Conductor en el origen",
    riderNext: "Muéstrale tu código al subir",
    driverNext: "«Iniciar viaje» cuando suba el pasajero",
  },
  in_trip: {
    title: "Viaje en curso",
    riderNext: "Sigue el estado",
    driverNext: "«Completar viaje» al llegar al destino",
  },
  completed: {
    title: "Viaje completado",
    riderNext: "Detalle y propina",
    driverNext: "Panel de conductor",
  },
};

/** Same status headline + ticket + route for rider and driver; each gets their app link. */
async function sendRidePhaseWhatsAppPair(
  supabase: SupabaseClient,
  args: {
    ride: RideBookingRow;
    phase: RideNotifyPhase;
    driverUserId: string;
    finalTotalMxnCents?: number;
    driverPayoutMxnCents?: number;
  },
): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;

  const { ride, phase, driverUserId } = args;
  const copy = PHASE_WHATSAPP_COPY[phase];
  const ticket = ride.ticket_code ?? "—";
  const route = `${ride.pickup_address} → ${ride.dropoff_address}`;
  const header = `🚕 *${copy.title}*\nTicket *${ticket}*\n${route}`;

  let riderBody = header;
  let driverBody = header;

  if (phase === "completed") {
    const fare = formatMxnFromCents(
      args.finalTotalMxnCents ?? ride.final_total_mxn_cents ?? ride.estimated_total_mxn_cents,
    );
    riderBody += `\nTarifa: *${fare}*`;
    driverBody += `\nTarifa: *${fare}*`;
    const payout = formatMxnFromCents(args.driverPayoutMxnCents ?? 0);
    if (payout && payout !== "$0.00") {
      driverBody += `\nPago conductor: *${payout}*`;
    }
  }

  const selfRide = isSelfRide(ride, driverUserId);

  if (!selfRide) {
    const buyerPhone = await findUserPhoneById(supabase, ride.buyer_id);
    if (buyerPhone) {
      const viajeUrl = rideBuyerViajeUrl(ride.id, ride.ticket_code);
      await sendWhatsAppToE164Digits(
        buyerPhone,
        `${riderBody}\n\n${copy.riderNext}:\n${viajeUrl}`,
      );
    }
  }

  const driverPhone = await findUserPhoneById(supabase, driverUserId);
  if (driverPhone) {
    const panelUrl = rideDriverPanelUrl(ride.id, ride.ticket_code);
    await sendWhatsAppToE164Digits(
      driverPhone,
      `${driverBody}\n\n${copy.driverNext}:\n${panelUrl}`,
    );
  }
}

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
  try {
    const phaseStatus: Record<RideNotifyPhase, RideBookingRow["status"]> = {
      accepted: "accepted",
      arrived: "arrived",
      in_trip: "in_trip",
      completed: "completed",
    };
    const base = (await getRideById(supabase, args.ride.id)) ?? args.ride;
    const fresh = await applyEventTruthToRide(supabase, base);
    const phaseSt = phaseStatus[args.phase];
    const rideForNotify =
      rideStatusRank(fresh.status) >= rideStatusRank(phaseSt)
        ? fresh
        : { ...fresh, status: phaseSt };
    await sendRidePhaseWhatsAppPair(supabase, {
      ...args,
      ride: rideForNotify,
    });
  } catch (e) {
    console.error("[ride-notify] emitRidePhaseNotifications", args.phase, e);
  }
}

export function extractTwilioPhone(fromField: string): string {
  const raw = String(fromField ?? "").replace(/^whatsapp:/i, "").trim();
  return e164DigitsForWhatsAppRecipient(raw);
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
