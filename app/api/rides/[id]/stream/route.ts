import { NextRequest } from "next/server";
import { isSameUserId } from "@/lib/auth-server";
import {
  applyEventTruthToRide,
  getRideById,
  getRideByIdFresh,
  statusFromRideEvent,
} from "@/lib/rides/ride-bookings-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import {
  encodeSseEvent,
  encodeSseKeepalive,
  lifecyclePayloadFromEvent,
  sseResponse,
  subscribeRideBookingChanges,
  subscribeRideEventInserts,
  toClientRideRow,
  type RideStreamSsePayload,
} from "@/lib/rides/ride-stream-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/rides/[id]/stream
 * Uber/Didi-style SSE: push on ride_events INSERT (authoritative) + ride_bookings fallback.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await ctx.params;
  const trimmed = String(rideId ?? "").trim();
  if (!trimmed) {
    return new Response("ID requerido", { status: 400 });
  }

  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const ride = await getRideByIdFresh(guard.supabase, trimmed, { attempts: 2, delayMs: 200 });
  if (!ride) {
    return new Response("Viaje no encontrado", { status: 404 });
  }

  const pool = await expandUserAccountIdPool(guard.supabase, guard.userId, {
    authPhone: guard.authPhone,
  });
  const allowed =
    pool.some((uid) => isSameUserId(uid, ride.buyer_id)) ||
    (ride.driver_id && pool.some((uid) => isSameUserId(uid, ride.driver_id)));

  if (!allowed) {
    return new Response("No autorizado", { status: 403 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let bookingChannel: ReturnType<typeof subscribeRideBookingChanges> | null = null;
      let eventChannel: ReturnType<typeof subscribeRideEventInserts> | null = null;

      const pushPayload = async (payload: RideStreamSsePayload) => {
        try {
          controller.enqueue(encodeSseEvent(payload));
        } catch {
          /* stream closed */
        }
      };

      const pushFromRow = async (row: typeof ride, lifecycle?: RideStreamSsePayload["lifecycle"]) => {
        const truth = await applyEventTruthToRide(guard.supabase, row);
        await pushPayload({
          lifecycle,
          ride: toClientRideRow(truth),
        });
      };

      void pushFromRow(ride);

      bookingChannel = subscribeRideBookingChanges(guard.supabase, {
        filter: `id=eq.${trimmed}`,
        onChange: (row) => {
          void pushFromRow(row);
        },
      });

      eventChannel = subscribeRideEventInserts(guard.supabase, {
        rideId: trimmed,
        onInsert: (evt) => {
          void (async () => {
            const mapped = statusFromRideEvent(evt.event_type, evt.to_status);
            if (!mapped) return;
            const base = (await getRideById(guard.supabase, trimmed)) ?? ride;
            const seed = { ...base, status: mapped };
            const truth = await applyEventTruthToRide(guard.supabase, seed);
            await pushPayload({
              lifecycle: lifecyclePayloadFromEvent(evt.event_type, truth.status),
              ride: toClientRideRow(truth),
            });
          })();
        },
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encodeSseKeepalive());
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        if (bookingChannel) void guard.supabase.removeChannel(bookingChannel);
        if (eventChannel) void guard.supabase.removeChannel(eventChannel);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return sseResponse(stream);
}
