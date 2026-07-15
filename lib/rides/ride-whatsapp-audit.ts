import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import { sendWhatsAppToE164Digits } from "@/lib/twilio";

export type RideWhatsAppRecipientRole = "buyer" | "driver";

export type RideWhatsAppAuditInsert = {
  rideId?: string | null;
  ticketCode?: string | null;
  phase: string;
  recipientRole: RideWhatsAppRecipientRole;
  recipientUserId?: string | null;
  recipientPhoneDigits?: string | null;
  body: string;
  twilioOk: boolean;
};

/** Persist one outbound ride WhatsApp with encrypted phone + body (enc:v1:). */
export async function insertRideWhatsAppAudit(
  supabase: SupabaseClient,
  args: RideWhatsAppAuditInsert,
): Promise<void> {
  const body = String(args.body ?? "");
  const phone = String(args.recipientPhoneDigits ?? "").trim();
  const { error } = await supabase.from("ride_whatsapp_notify_log").insert({
    ride_id: args.rideId ? String(args.rideId) : null,
    ticket_code: args.ticketCode ? String(args.ticketCode).trim().toUpperCase() : null,
    phase: String(args.phase ?? "unknown").slice(0, 64),
    recipient_role: args.recipientRole,
    recipient_user_id: args.recipientUserId ? String(args.recipientUserId) : null,
    recipient_phone_enc: phone ? encryptPii(phone) : null,
    body_enc: encryptPii(body),
    twilio_ok: Boolean(args.twilioOk),
  });
  if (error) {
    console.error("[ride-whatsapp-audit] insert failed", error.message);
  }
}

/** Send WhatsApp and append encrypted audit row (never blocks the trip on audit failure). */
export async function sendRideWhatsAppWithAudit(
  supabase: SupabaseClient,
  args: Omit<RideWhatsAppAuditInsert, "twilioOk"> & { recipientPhoneDigits: string },
): Promise<boolean> {
  const phone = String(args.recipientPhoneDigits ?? "").trim();
  const body = String(args.body ?? "");
  let ok = false;
  try {
    ok = phone ? await sendWhatsAppToE164Digits(phone, body) : false;
  } catch (e) {
    console.error("[ride-whatsapp-audit] send failed", e);
    ok = false;
  }
  try {
    await insertRideWhatsAppAudit(supabase, { ...args, twilioOk: ok });
  } catch (e) {
    console.error("[ride-whatsapp-audit] audit failed", e);
  }
  return ok;
}

export type RideWhatsAppAuditRow = {
  id: string;
  ride_id: string | null;
  ticket_code: string | null;
  phase: string;
  recipient_role: RideWhatsAppRecipientRole;
  recipient_user_id: string | null;
  recipient_phone: string | null;
  body: string;
  twilio_ok: boolean;
  created_at: string;
};

/** Admin read — decrypt phone + body for compliance review. */
export function decryptRideWhatsAppAuditRow(row: {
  id: string;
  ride_id: string | null;
  ticket_code: string | null;
  phase: string;
  recipient_role: string;
  recipient_user_id: string | null;
  recipient_phone_enc: string | null;
  body_enc: string;
  twilio_ok: boolean;
  created_at: string;
}): RideWhatsAppAuditRow {
  return {
    id: row.id,
    ride_id: row.ride_id,
    ticket_code: row.ticket_code,
    phase: row.phase,
    recipient_role: row.recipient_role as RideWhatsAppRecipientRole,
    recipient_user_id: row.recipient_user_id,
    recipient_phone: row.recipient_phone_enc ? decryptPii(row.recipient_phone_enc) : null,
    body: decryptPii(row.body_enc),
    twilio_ok: row.twilio_ok,
    created_at: row.created_at,
  };
}
