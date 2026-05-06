import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { sendWhatsApp } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";
import { hasBuyerPhaseNotify, recordBuyerPhaseNotify } from "@/lib/booking-lifecycle";

/**
 * WhatsApp nudge when seller advances booking (scheduled / in progress). Skips `completed` (handled by review prompt).
 */
export async function notifyBuyerLifecyclePhase(
  supabase: SupabaseClient,
  bookingId: string,
  phase: "scheduled" | "in_progress"
): Promise<void> {
  const idVars = idMatchVariantsForIn(String(bookingId));
  if (idVars.length === 0) return;

  if (await hasBuyerPhaseNotify(supabase, bookingId, phase)) return;

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("id,buyer_id,listing_id,ticket_code,status,payment_status")
    .in("id", idVars)
    .maybeSingle();

  if (!booking || booking.payment_status !== "paid") return;

  const buyerPool = await expandUserAccountIdPool(supabase, String(booking.buyer_id));
  const { data: buyerRows } = await supabase
    .from("users")
    .select("phone")
    .in("id", buyerPool)
    .limit(1);
  const buyerPhone = buyerRows?.[0]?.phone?.trim();
  if (!buyerPhone) {
    console.warn("[buyer-phase-notify] no buyer phone", { bookingId });
    return;
  }

  const { data: listingRow } = await supabase
    .from("listings")
    .select("title_es")
    .eq("id", booking.listing_id)
    .maybeSingle();
  const title = listingRow?.title_es?.trim() || "Tu servicio";

  const appUrl = getPublicAppUrl();
  const ticket = booking.ticket_code ? `Ticket: *${booking.ticket_code}*` : `Reserva: \`${booking.id.slice(0, 8)}…\``;
  const bookingsUrl = `${appUrl}/my-bookings`;

  const body =
    phase === "scheduled"
      ? [
          `📅 *Visita agendada — Naranjogo*`,
          ``,
          `El proveedor registró tu servicio como *agendado*.`,
          `*${title}*`,
          ticket,
          ``,
          `Seguimiento y garantía en la app:`,
          bookingsUrl,
        ].join("\n")
      : [
          `🔧 *Servicio en curso — Naranjogo*`,
          ``,
          `El proveedor indicó que *ya inició* el trabajo.`,
          `*${title}*`,
          ticket,
          ``,
          `Detalles en:`,
          bookingsUrl,
        ].join("\n");

  const ok = await sendWhatsApp(buyerPhone, body);
  if (ok) await recordBuyerPhaseNotify(supabase, bookingId, phase);
}
