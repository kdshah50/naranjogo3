import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, getUserIdFromRequest, idMatchVariantsForIn } from "@/lib/auth-server";
import { sortRowsWithPreferredUserId } from "@/lib/user-id-variants";
import {
  expandUserAccountIdPool,
  poolsOverlap,
  userParticipatesInConversation,
} from "@/lib/user-account-pool";
import { e164DigitsForWhatsAppRecipient } from "@/lib/phone";
import { sendWhatsAppToE164Digits } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";
import { buyerPaidContactFeeForListing } from "@/lib/contact-gate";

export const dynamic = "force-dynamic";

/** Pasted wa.me links, WhatsApp URL handlers, tel:, or Google-style share text — blocked for sellers until buyer pays. */
function bodyLeaksExternalWhatsAppInvite(raw: string): boolean {
  const b = raw.trim();
  if (/wa\.me\//i.test(b)) return true;
  if (/whatsapp\.com/i.test(b)) return true;
  if (/chat\s+on\s+whatsapp\s+with/i.test(b)) return true;
  if (/tel:\s*\+?\d/i.test(b)) return true;
  return false;
}

/** POST { body } — append message; must be buyer or seller. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const conversationId = params.id;
    const json = await req.json();
    const body = String(json?.body ?? "").trim();
    if (!body || body.length > 4000) {
      return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const idVars = idMatchVariantsForIn(conversationId);
    const { data: conv, error: convErr } = await supabase
      .from("listing_conversations")
      .select("id,buyer_id,seller_id,listing_id")
      .in("id", idVars)
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const allowed = await userParticipatesInConversation(
      supabase,
      userId,
      conv.buyer_id,
      conv.seller_id,
      conv.listing_id,
    );
    if (!allowed) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const convRowId = conv.id;
    const myPool = await expandUserAccountIdPool(supabase, userId);
    const buyerPool = await expandUserAccountIdPool(supabase, conv.buyer_id);
    const iAmBuyer = poolsOverlap(myPool, buyerPool);

    if (!iAmBuyer && bodyLeaksExternalWhatsAppInvite(body)) {
      const paid = await buyerPaidContactFeeForListing(supabase, conv.listing_id, conv.buyer_id);
      if (!paid) {
        return NextResponse.json(
          {
            error:
              "No puedes enviar enlaces de WhatsApp ni teléfono hasta que el comprador pague la tarifa en la app. Coordina aquí por mensaje.",
          },
          { status: 400 }
        );
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("listing_messages")
      .insert({ conversation_id: convRowId, sender_id: userId, body })
      .select("id,sender_id,body,created_at")
      .single();

    if (insErr) {
      console.error("[conversations/:id/messages] insert", insErr);
      return NextResponse.json({ error: "No se pudo enviar" }, { status: 500 });
    }

    await supabase.from("listing_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convRowId);

    if (poolsOverlap(myPool, buyerPool)) {
      const now = new Date().toISOString();
      const { data: gate } = await supabase
        .from("listing_service_contact_gate")
        .select("listing_id,buyer_id")
        .eq("listing_id", conv.listing_id)
        .in("buyer_id", myPool)
        .maybeSingle();
      if (!gate) {
        const { error: gateInsErr } = await supabase.from("listing_service_contact_gate").insert({
          listing_id: conv.listing_id,
          buyer_id: userId,
          contacted_in_app: true,
          updated_at: now,
        });
        if (gateInsErr) console.error("[messages] contact_gate insert", gateInsErr);
      } else {
        const { error: upErr } = await supabase
          .from("listing_service_contact_gate")
          .update({ contacted_in_app: true, updated_at: now })
          .eq("listing_id", conv.listing_id)
          .eq("buyer_id", gate.buyer_id);
        if (upErr) console.error("[messages] contact_gate update", upErr);
      }
    }

    const recipientRootId = iAmBuyer ? conv.seller_id : conv.buyer_id;
    const recipientPool = await expandUserAccountIdPool(supabase, recipientRootId);

    console.log("[notify] sender:", userId, "recipientRoot:", recipientRootId, "conv:", conversationId);

    if (poolsOverlap(myPool, recipientPool)) {
      console.warn("[notify] skipping notify — sender and recipient share merged account pool");
      return NextResponse.json({ message: inserted });
    }

    try {
      const { data: recipientRowsRaw } = await supabase
        .from("users")
        .select("id,phone,display_name")
        .in("id", recipientPool);
      const recipientRows = sortRowsWithPreferredUserId(recipientRowsRaw ?? [], String(recipientRootId));

      let recipientDigits = "";
      for (const row of recipientRows) {
        const d = e164DigitsForWhatsAppRecipient(row?.phone);
        if (d) {
          recipientDigits = d;
          break;
        }
      }

      if (!recipientDigits) {
        console.warn("[notify] no dialable phone for recipient pool", {
          recipientRootId,
          poolSize: recipientPool.length,
          rows: recipientRows?.length ?? 0,
        });
      } else {
        const { data: sender } = await supabase
          .from("users")
          .select("display_name")
          .in("id", idMatchVariantsForIn(userId))
          .maybeSingle();

        const { data: listingRow } = await supabase
          .from("listings")
          .select("title_es")
          .in("id", idMatchVariantsForIn(conv.listing_id))
          .maybeSingle();

        const senderName = sender?.display_name?.trim() || "Un cliente";
        const listingTitle = listingRow?.title_es || "tu servicio";
        const preview = body.length > 80 ? body.slice(0, 80) + "…" : body;
        const appUrl = getPublicAppUrl();

        const msg = [
          `💬 *Nuevo mensaje en Naranjogo*`,
          ``,
          `De: ${senderName}`,
          `Servicio: ${listingTitle}`,
          ``,
          `"${preview}"`,
          ``,
          `→ ${appUrl}/listing/${conv.listing_id}?chat=${convRowId}`,
        ].join("\n");

        console.log("[notify] sending WhatsApp to digits:", recipientDigits.slice(0, 5) + "…");
        const sent = await sendWhatsAppToE164Digits(recipientDigits, msg);
        console.log("[notify]", sent ? "sent" : "failed");
      }
    } catch (e) {
      console.error("[notify] error", e);
    }

    return NextResponse.json({ message: inserted });
  } catch (e) {
    console.error("[conversations/:id/messages] POST", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
