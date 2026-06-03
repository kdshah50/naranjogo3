import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { isRidesEnabled, isRidesWhatsappInboundEnabled } from "@/lib/rides/flags";
import {
  createRideRequest,
  matchRideToDriver,
} from "@/lib/rides/ride-bookings-server";
import {
  extractTwilioPhone,
  findUserIdByPhone,
  notifyBuyerRideCreated,
  notifyDriverRideMatched,
  rideBuyerViajeUrl,
  twimlMessage,
} from "@/lib/rides/ride-notify";
import {
  buildRideIntentLocations,
  parseRideIntentFromText,
  RIDE_WHATSAPP_HELP_ES,
} from "@/lib/rides/whatsapp-inbound";
import { formatMxnFromCents } from "@/lib/rides/ride-pricing";

export const dynamic = "force-dynamic";

/**
 * POST /api/rides/whatsapp/inbound
 * Twilio WhatsApp webhook for ride requests (Phase 2 sandbox path).
 */
export async function POST(req: NextRequest) {
  if (!isRidesEnabled() || !isRidesWhatsappInboundEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const form = await req.formData();
    const from = String(form.get("From") ?? "");
    const body = String(form.get("Body") ?? "").trim();
    const phone = extractTwilioPhone(from);

    if (!body) {
      return new NextResponse(twimlMessage(RIDE_WHATSAPP_HELP_ES), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const intent = parseRideIntentFromText(body);
    if (!intent) {
      return new NextResponse(twimlMessage(RIDE_WHATSAPP_HELP_ES), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const locations = buildRideIntentLocations(intent);
    if (!locations) {
      return new NextResponse(twimlMessage("No reconocí las colonias. " + RIDE_WHATSAPP_HELP_ES), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const supabase = createAdminSupabase();
    const buyerId = await findUserIdByPhone(supabase, phone);
    if (!buyerId) {
      const msg =
        "Para pedir taxi por WhatsApp necesitas una cuenta NaranjoGo con este número.\n" +
        "Entra en la app, verifica tu teléfono y carga saldo en /saldo.";
      return new NextResponse(twimlMessage(msg), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    const created = await createRideRequest(supabase, {
      buyerId,
      pickup: locations.pickup,
      dropoff: locations.dropoff,
      pickupColoniaKey: intent.pickupColoniaKey,
      dropoffColoniaKey: intent.dropoffColoniaKey,
      source: "whatsapp_twilio",
      autoMatch: true,
    });

    if (!created.ok) {
      const msg =
        created.code === "insufficient_balance"
          ? "Saldo insuficiente. Carga saldo en NaranjoGo (/saldo) e intenta de nuevo."
          : created.error;
      return new NextResponse(twimlMessage(msg), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    let ride = created.ride;
    let matched = created.matched;

    if (!matched) {
      const match = await matchRideToDriver(supabase, {
        rideId: ride.id,
        pickupColoniaKey: intent.pickupColoniaKey,
      });
      if (match.ok) {
        ride = match.ride;
        matched = true;
      }
    }

    await notifyBuyerRideCreated(supabase, { ride, matched });
    if (matched && ride.driver_id) {
      await notifyDriverRideMatched(supabase, {
        ride,
        driverUserId: ride.driver_id,
      });
    }

    const fare = formatMxnFromCents(ride.estimated_total_mxn_cents);
    let reply =
      `✅ Viaje solicitado\n` +
      `${ride.pickup_address} → ${ride.dropoff_address}\n` +
      `Tarifa est.: *${fare}*`;

    const viajeUrl = rideBuyerViajeUrl(ride.id, ride.ticket_code);
    if (matched && ride.ticket_code) {
      reply += `\n\nConductor asignado. Código: *${ride.ticket_code}*\n${viajeUrl}`;
    } else if (!matched) {
      reply += `\n\nNo hay conductores disponibles ahora. Intenta en unos minutos.`;
    } else {
      reply += `\n\n${viajeUrl}`;
    }

    return new NextResponse(twimlMessage(reply), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("[rides/whatsapp/inbound] POST", e);
    return new NextResponse(twimlMessage("Error temporal. Intenta de nuevo o usa /viaje en la app."), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
