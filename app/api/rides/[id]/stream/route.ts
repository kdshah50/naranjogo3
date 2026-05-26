import { NextRequest } from "next/server";
import { isSameUserId } from "@/lib/auth-server";
import { getRideById } from "@/lib/rides/ride-bookings-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import {
  encodeSseEvent,
  encodeSseKeepalive,
  sseResponse,
  subscribeRideBookingChanges,
  toClientRideRow,
} from "@/lib/rides/ride-stream-server";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/rides/[id]/stream
 * Server-Sent Events: push ride row updates (Supabase Realtime on server + cookie auth).
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

  const ride = await getRideById(guard.supabase, trimmed);
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
      let channel: ReturnType<typeof subscribeRideBookingChanges> | null = null;

      const push = (row: typeof ride) => {
        try {
          controller.enqueue(encodeSseEvent({ ride: toClientRideRow(row) }));
        } catch {
          /* stream closed */
        }
      };

      push(ride);

      channel = subscribeRideBookingChanges(guard.supabase, {
        filter: `id=eq.${trimmed}`,
        onChange: push,
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
        if (channel) void guard.supabase.removeChannel(channel);
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
