import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";
import { getAdminPin, isAdminPinConfigured } from "@/lib/admin-pin";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 2000;
const DEFAULT_LIMIT = 500;

export type ListingMessageAuditRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  sender_id: string;
  body: string;
  body_sha256: string;
  message_source: string;
  message_created_at: string;
  archived_at: string;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function auditRowsToCsv(rows: ListingMessageAuditRow[]): string {
  const headers = [
    "id",
    "message_id",
    "conversation_id",
    "listing_id",
    "buyer_id",
    "seller_id",
    "sender_id",
    "message_source",
    "message_created_at",
    "archived_at",
    "body_sha256",
    "body",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.message_id,
        row.conversation_id,
        row.listing_id,
        row.buyer_id,
        row.seller_id,
        row.sender_id,
        row.message_source,
        row.message_created_at,
        row.archived_at,
        row.body_sha256,
        row.body,
      ]
        .map((v) => csvEscape(String(v ?? "")))
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * GET ?pin=&since=&until=&conversationId=&listingId=&source=&limit=&cursor=&format=json|csv
 * Export append-only in-app message audit log (compliance / disputes).
 */
export async function GET(req: NextRequest) {
  if (!isAdminPinConfigured()) {
    return NextResponse.json(
      { error: "Admin no configurado: define ADMIN_PIN en el servidor" },
      { status: 503 },
    );
  }

  const pin = req.nextUrl.searchParams.get("pin")?.trim() ?? "";
  if (!pin || pin !== getAdminPin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const since = req.nextUrl.searchParams.get("since")?.trim() || null;
  const until = req.nextUrl.searchParams.get("until")?.trim() || null;
  const conversationId = req.nextUrl.searchParams.get("conversationId")?.trim() || null;
  const listingId = req.nextUrl.searchParams.get("listingId")?.trim() || null;
  const source = req.nextUrl.searchParams.get("source")?.trim() || null;
  const format = req.nextUrl.searchParams.get("format")?.trim() === "csv" ? "csv" : "json";
  const cursor = req.nextUrl.searchParams.get("cursor")?.trim() || null;

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const supabase = createAdminSupabase();
  let q = supabase
    .from("listing_message_audit_log")
    .select(
      "id,message_id,conversation_id,listing_id,buyer_id,seller_id,sender_id,body,body_sha256,message_source,message_created_at,archived_at",
    )
    .order("message_created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (since) q = q.gte("message_created_at", since);
  if (until) q = q.lte("message_created_at", until);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  if (listingId) q = q.eq("listing_id", listingId);
  if (source) q = q.eq("message_source", source);
  if (cursor) q = q.gt("id", cursor);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/message-audit]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = (data ?? []) as ListingMessageAuditRow[];
  const hasMore = all.length > limit;
  const rows = hasMore ? all.slice(0, limit) : all;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1]!.id : null;

  if (format === "csv") {
    const csv = auditRowsToCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="listing-message-audit.csv"',
        "X-Next-Cursor": nextCursor ?? "",
      },
    });
  }

  return NextResponse.json({
    rows,
    count: rows.length,
    nextCursor,
    hasMore,
  });
}
