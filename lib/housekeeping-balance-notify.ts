import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/app-url";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { VETERINARY_SERVICE } from "@/lib/provider-services";
import { notifyBuyerSupplementBalanceDueTitle } from "@/lib/service-quote-vertical";
import { formatMxn } from "@/lib/service-quote";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { idMatchVariantsForIn } from "@/lib/auth-server";

export async function notifyBuyerHousekeepingBalanceDue(
  supabase: SupabaseClient,
  bookingId: string,
  balanceCents: number,
  lang: "es" | "en" = "es",
  providerSlug?: string | null,
): Promise<void> {
  if (!isTwilioWhatsAppConfigured() || balanceCents < 100) return;

  const { data: booking } = await supabase
    .from("service_bookings")
    .select("buyer_id,listing_id,ticket_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.buyer_id) return;

  const { data: listing } = await supabase
    .from("listings")
    .select("title_es")
    .eq("id", booking.listing_id)
    .maybeSingle();

  const { data: buyer } = await supabase
    .from("users")
    .select("phone")
    .in("id", idMatchVariantsForIn(String(booking.buyer_id)))
    .maybeSingle();

  const digits = e164DigitsForWhatsAppRecipient(String(buyer?.phone ?? ""));
  if (!digits) return;

  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/my-bookings?ticket=${encodeURIComponent(String(booking.ticket_code ?? bookingId))}`;
  const amt = formatMxn(balanceCents, lang);
  const title = String(
    listing?.title_es ?? (providerSlug === VETERINARY_SERVICE ? "Veterinaria" : "Limpieza"),
  );
  const heading = notifyBuyerSupplementBalanceDueTitle(providerSlug, lang);

  const msg =
    lang === "en"
      ? [
          heading,
          "",
          `Service: *${title}*`,
          `Balance due: *${amt}*`,
          "",
          "Pay the remaining balance in the app (secure Stripe checkout).",
          "",
          link,
        ].join("\n")
      : [
          heading,
          "",
          `Servicio: *${title}*`,
          `Saldo pendiente: *${amt}*`,
          "",
          "Paga el saldo restante en la app (Stripe seguro).",
          "",
          link,
        ].join("\n");

  await sendWhatsAppToE164Digits(digits, msg);
}
