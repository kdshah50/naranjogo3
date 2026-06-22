import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicAppUrl } from "@/lib/app-url";
import { formatMxn, type ServiceQuoteStatus } from "@/lib/service-quote";
import { notifyBuyerRequestTitle, notifyQuoteSentTitle, notifyBuyerRequestConfirmationTitle, notifyBuyerRequestConfirmationLine } from "@/lib/service-quote-vertical";
import { phoneDigitsForAccountPool } from "@/lib/user-phone-notify";
import { sendWhatsAppToE164Digits, isTwilioWhatsAppConfigured } from "@/lib/twilio";

async function loadUserPhone(supabase: SupabaseClient, userId: string): Promise<string> {
  const digits = await phoneDigitsForAccountPool(supabase, userId);
  if (!digits) {
    console.warn("[service-quote-notify] no WhatsApp digits for user pool", {
      userIdTail: String(userId).slice(-8),
    });
  }
  return digits;
}

export async function notifyBuyerServiceQuoteSent(opts: {
  supabase: SupabaseClient;
  buyerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  totalCents: number;
  lang?: "es" | "en";
  providerSlug?: string | null;
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.buyerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}&quote=1`;
  const total = formatMxn(opts.totalCents, lang);
  const title = notifyQuoteSentTitle(opts.providerSlug, lang);

  const msg =
    lang === "en"
      ? [
          title,
          "",
          `Service: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "Open the app to *Accept* or *Decline*, then pay the deposit.",
          "",
          link,
        ].join("\n")
      : [
          title,
          "",
          `Servicio: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "Abre la app para *Aceptar* o *Rechazar*, luego paga el depósito.",
          "",
          link,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(digits, msg);
  if (!ok) {
    console.error("[service-quote-notify] buyer quote WhatsApp send failed", {
      buyerIdTail: String(opts.buyerId).slice(-8),
    });
  }
}

export async function notifySellerBuyerServiceRequest(opts: {
  supabase: SupabaseClient;
  sellerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  buyerName: string;
  totalCents: number;
  lang?: "es" | "en";
  providerSlug?: string | null;
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.sellerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}&request=1`;
  const total = formatMxn(opts.totalCents, lang);
  const title = notifyBuyerRequestTitle(opts.providerSlug, lang);

  const msg =
    lang === "en"
      ? [
          title,
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
          title,
          "",
          `De: *${opts.buyerName}*`,
          `Anuncio: *${opts.listingTitle}*`,
          `Estimado: *${total}*`,
          "",
          "Envía tu cotización oficial desde el chat en la app.",
          "",
          link,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(digits, msg);
  if (!ok) {
    console.error("[service-quote-notify] seller request WhatsApp send failed", {
      sellerIdTail: String(opts.sellerId).slice(-8),
    });
  }
}

/** Confirmation to the buyer right after they submit a structured service request. */
export async function notifyBuyerServiceRequestSent(opts: {
  supabase: SupabaseClient;
  buyerId: string;
  listingId: string;
  listingTitle: string;
  conversationId: string;
  totalCents: number;
  lang?: "es" | "en";
  providerSlug?: string | null;
}): Promise<void> {
  if (!isTwilioWhatsAppConfigured()) return;
  const digits = await loadUserPhone(opts.supabase, opts.buyerId);
  if (!digits) return;

  const lang = opts.lang ?? "es";
  const appUrl = getPublicAppUrl();
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}`;
  const total = formatMxn(opts.totalCents, lang);
  const title = notifyBuyerRequestConfirmationTitle(opts.providerSlug, lang);
  const bodyLine = notifyBuyerRequestConfirmationLine(opts.providerSlug, lang);

  const msg =
    lang === "en"
      ? [
          title,
          "",
          `Service: *${opts.listingTitle}*`,
          `Estimated: *${total}*`,
          "",
          bodyLine,
          "",
          "Track status in the app:",
          link,
        ].join("\n")
      : [
          title,
          "",
          `Servicio: *${opts.listingTitle}*`,
          `Estimado: *${total}*`,
          "",
          bodyLine,
          "",
          "Sigue el estado en la app:",
          link,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(digits, msg);
  if (!ok) {
    console.error("[service-quote-notify] buyer request confirmation WhatsApp send failed", {
      buyerIdTail: String(opts.buyerId).slice(-8),
    });
  }
}

/** Confirmation to the provider after they send an official quote (pending Accept/Decline). */
export async function notifySellerQuoteSent(opts: {
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
  const link = `${appUrl}/listing/${opts.listingId}?chat=${opts.conversationId}`;
  const total = formatMxn(opts.totalCents, lang);

  const msg =
    lang === "en"
      ? [
          "📋 *Official quote sent — Naranjogo*",
          "",
          `To: *${opts.buyerName}*`,
          `Service: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "The customer gets WhatsApp with Accept / Decline. You’ll be notified when they respond.",
          "",
          link,
        ].join("\n")
      : [
          "📋 *Cotización oficial enviada — Naranjogo*",
          "",
          `Para: *${opts.buyerName}*`,
          `Servicio: *${opts.listingTitle}*`,
          `Total: *${total}*`,
          "",
          "El cliente recibe WhatsApp con Aceptar / Rechazar. Te avisamos cuando responda.",
          "",
          link,
        ].join("\n");

  const ok = await sendWhatsAppToE164Digits(digits, msg);
  if (!ok) {
    console.error("[service-quote-notify] seller quote-sent WhatsApp failed", {
      sellerIdTail: String(opts.sellerId).slice(-8),
    });
  }
}

/** @deprecated Use notifySellerBuyerServiceRequest */
export const notifySellerBuyerCleaningRequest = notifySellerBuyerServiceRequest;

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
