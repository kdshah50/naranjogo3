import { NextRequest } from "next/server";
import { loadDriverPanel } from "@/lib/rides/driver-panel-server";
import { ridesRouteGuard } from "@/lib/rides/ride-route-guard";
import type { RideBookingRow } from "@/lib/rides/ride-bookings-server";
import {
  encodeSseEvent,
  encodeSseKeepalive,
  sseResponse,
  subscribeRideBookingChanges,
  toClientRideRow,
} from "@/lib/rides/ride-stream-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DRIVER_ACTIVE = new Set(["matched", "accepted", "arrived", "in_trip"]);

function panelPayload(panel: Awaited<ReturnType<typeof loadDriverPanel>>) {
  return {
    driver: panel.driver,
    trips: panel.trips
      .filter((t) => DRIVER_ACTIVE.has(t.status))
      .map(toClientRideRow),
    canonical_user_id: panel.canonical_user_id,
    session_user_id: panel.session_user_id,
    auth_phone_set: panel.auth_phone_set,
  };
}

/**
 * GET /api/rides/drivers/me/stream
 * SSE for driver panel: trips + online status when ride_bookings change for this driver.
 */
export async function GET(req: NextRequest) {
  const guard = await ridesRouteGuard(req);
  if (!guard.ok) return guard.response;

  const initial = await loadDriverPanel(guard.supabase, {
    sessionUserId: guard.userId,
    authPhone: guard.authPhone,
  });

  const driverId = initial.canonical_user_id ?? initial.driver?.user_id ?? null;
  if (!driverId) {
    return new Response("Perfil de conductor no encontrado", { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let channel: ReturnType<typeof subscribeRideBookingChanges> | null = null;
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;

      const pushPanel = async () => {
        const panel = await loadDriverPanel(guard.supabase, {
          sessionUserId: guard.userId,
          authPhone: guard.authPhone,
        });
        try {
          controller.enqueue(encodeSseEvent(panelPayload(panel)));
        } catch {
          /* closed */
        }
      };

      const scheduleReload = () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          void pushPanel();
        }, 150);
      };

      await pushPanel();

      channel = subscribeRideBookingChanges(guard.supabase, {
        filter: `driver_id=eq.${driverId}`,
        onChange: (_row: RideBookingRow) => scheduleReload(),
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
        if (reloadTimer) clearTimeout(reloadTimer);
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
