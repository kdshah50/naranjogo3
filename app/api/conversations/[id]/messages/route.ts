import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSupabase,
  getUserIdFromRequest,
  idMatchVariantsForIn,
  isSameUserId,
} from "@/lib/auth-server";
import { sendWhatsApp } from "@/lib/twilio";
import { getPublicAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

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

    const convRowId = conv.id;

    if (!isSameUserId(conv.buyer_id, userId) && !isSameUserId(conv.seller_id, userId)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
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

    if (isSameUserId(conv.buyer_id, userId)) {
      const now = new Date().toISOString();
      const { data: gate } = await supabase
        .from("listing_service_contact_gate")
        .select("listing_id")
        .eq("listing_id", conv.listing_id)
        .eq("buyer_id", userId)
        .maybeSingle();
      if (!gate) {
        const { error: insErr } = await supabase.from("listing_service_contact_gate").insert({
          listing_id: conv.listing_id,
          buyer_id: userId,
          contacted_in_app: true,
          updated_at: now,
        });
        if (insErr) console.error("[messages] contact_gate insert", insErr);
      } else {
        const { error: upErr } = await supabase
          .from("listing_service_contact_gate")
          .update({ contacted_in_app: true, updated_at: now })
          .eq("listing_id", conv.listing_id)
          .eq("buyer_id", userId);
        if (upErr) console.error("[messages] contact_gate update", upErr);
      }
    }

    // Notify the other party via WhatsApp (awaited so Vercel doesn't kill it)
    const recipientId = isSameUserId(userId, conv.buyer_id) ? conv.seller_id : conv.buyer_id;
    console.log("[notify] sender:", userId, "recipient:", recipientId, "conv:", conversationId,
      "buyer_id:", conv.buyer_id, "seller_id:", conv.seller_id);
    if (recipientId && isSameUserId(recipientId, userId)) {
      console.warn("[notify] skipping self-notification (buyer_id === seller_id)");
      return NextResponse.json({ message: inserted });
    }
    try {
      const { data: recipient } = await supabase
        .from("users")
        .select("phone,display_name")
        .in("id", idMatchVariantsForIn(recipientId))
        .maybeSingle();

      console.log("[notify] recipient lookup:", { recipientId, phone: recipient?.phone, name: recipient?.display_name });

      if (!recipient?.phone) {
        console.warn("[notify] no phone for recipient", recipientId);
      } else {
        const { data: sender } = await supabase
          .from("users")
          .select("display_name")
          .in("id", idMatchVariantsForIn(userId))
          .maybeSingle();

        const { data: listingRow } = await supabase
          .from("listings")
          .select("title_es")
          .eq("id", conv.listing_id)
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
          `→ ${appUrl}/listing/${conv.listing_id}?chat=${conversationId}`,
        ].join("\n");

        console.log("[notify] sending WhatsApp to:", recipient.phone, "for recipient:", recipientId);
        const sent = await sendWhatsApp(recipient.phone, msg);
        console.log("[notify]", sent ? "sent" : "failed", { to: recipient.phone, recipientId });
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
