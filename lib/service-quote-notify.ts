import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/app-url";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";
import { formatMxn, type ServiceQuoteStatus } from "@/lib/service-quote";
import { idMatchVariantsForIn } from "@/lib/auth-server";

async function loadUserPhone(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("users")
    .select("phone")
    .in("id", idMatchVariantsForIn(userId))
    .limit(1)
    .maybeSingle();
  return e164DigitsForWhatsAppRecipient(String(data?.phone ?? ""));
}

export async function notifyBuyerServiceQuoteSent(opts: {
  supabase: SupabaseClient;
  buyerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  totalCents: number;
  lang?: "es" | "en";
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.buyerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}&quote=1`;
  const total = formatMxn(opts.totalCents, lang);

  const msg =
    lang === "en"
      ? [
          "📋 *New cleaning quote — Naranjogo*",
          "",
          `Service: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "Open the app to *Accept* or *Decline*, then pay the deposit.",
          "",
          link,
        ].join("\n")
      : [
          "📋 *Nueva cotización de limpieza — Naranjogo*",
          "",
          `Servicio: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "Abre la app para *Aceptar* o *Rechazar*, luego paga el depósito.",
          "",
          link,
        ].join("\n");

  await sendWhatsAppToE164Digits(digits, msg);
}

export async function notifySellerBuyerCleaningRequest(opts: {
  supabase: SupabaseClient;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  buyerName: string;
  totalCents: number;
  lang?: "es" | "en";
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.sellerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}&request=1`;
  const total = formatMxn(opts.totalCents, lang);

  const msg =
    lang === "en"
      ? [
          "🧹 *New cleaning request — Naranjogo*",
          "",
          `From: *${opts.buyerName}*`,
          `Listing: *${opts.listingTitle}*`,
          `Estimated: *${total}*`,
          "",
          "Send your official quote from the chat in the app.",
          "",
          link,
        ].join("\n")
      : [
          "🧹 *Nueva solicitud de limpieza — Naranjogo*",
          "",
          `De: *${opts.buyerName}*`,
          `Anuncio: *${opts.listingTitle}*`,
          `Estimado: *${total}*`,
          "",
          "Envía tu cotización oficial desde el chat en la app.",
          "",
          link,
        ].join("\n");

  await sendWhatsAppToE164Digits(digits, msg);
}

export async function notifySellerQuoteResponded(opts: {
  supabase: SupabaseClient;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  buyerName: string;
  status: Extract<ServiceQuoteStatus, "accepted" | "declined">;
  totalCents: number;
  lang?: "es" | "en";
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.sellerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}`;
  const total = formatMxn(opts.totalCents, lang);
  const accepted = opts.status === "accepted";

  const msg =
    lang === "en"
      ? [
          accepted ? "✅ *Quote accepted*" : "❌ *Quote declined*",
          "",
          `Client: *${opts.buyerName}*`,
          `Service: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          accepted
            ? "The client can pay the deposit in the app. Coordinate the visit in chat."
            : "You can send a revised quote in the app.",
          "",
          link,
        ].join("\n")
      : [
          accepted ? "✅ *Cotización aceptada*" : "❌ *Cotización rechazada*",
          "",
          `Cliente: *${opts.buyerName}*`,
          `Servicio: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          accepted
            ? "El cliente puede pagar el depósito en la app. Coordina la visita en el chat."
            : "Puedes enviar una cotización revisada en la app.",
          "",
          link,
        ].join("\n");

  await sendWhatsAppToE164Digits(digits, msg);
}
