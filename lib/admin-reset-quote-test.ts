import type { SupabaseClient } from "@supabase/supabase-js";
import { idMatchVariantsForIn } from "@/lib/auth-server";
import { isTailoringListingTitle } from "@/lib/tailoring-listings";

export type QuoteTestResetOptions = {
  /** Limit to one listing row id; must be a tailoring listing. */
  listingId?: string;
  /** Limit gate/message/booking reset to this buyer id. */
  buyerId?: string;
  /** Delete in-app chat messages (conversations remain). Default true. */
  clearMessages?: boolean;
  /** Cancel non-terminal service_bookings on targeted listings. Default true. */
  cancelOpenBookings?: boolean;
};

export type QuoteTestResetPreview = {
  listingIds: string[];
  listings: Array<{ id: string; title_es: string }>;
  contactGateRows: number;
  messageRows: number;
  openBookings: number;
};

async function resolveTailoringListingIds(
  supabase: SupabaseClient,
  listingId?: string,
): Promise<Array<{ id: string; title_es: string }>> {
  if (listingId?.trim()) {
    const id = listingId.trim();
    const { data, error } = await supabase.from("listings").select("id,title_es").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Listing not found");
    if (!isTailoringListingTitle(data.title_es)) {
      throw new Error("Listing is not a tailoring service (title must start with tailoring provider prefix)");
    }
    return [{ id: String(data.id), title_es: String(data.title_es ?? "") }];
  }

  const { data, error } = await supabase
    .from("listings")
    .select("id,title_es")
    .eq("category_id", "services")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => isTailoringListingTitle(row.title_es))
    .map((row) => ({ id: String(row.id), title_es: String(row.title_es ?? "") }));
}

export async function previewQuoteTestReset(
  supabase: SupabaseClient,
  opts: QuoteTestResetOptions = {},
): Promise<QuoteTestResetPreview> {
  const listings = await resolveTailoringListingIds(supabase, opts.listingId);
  const listingIds = listings.map((l) => l.id);
  if (listingIds.length === 0) {
    return { listingIds: [], listings: [], contactGateRows: 0, messageRows: 0, openBookings: 0 };
  }

  const listVars = [...new Set(listingIds.flatMap((id) => idMatchVariantsForIn(id)))];
  const buyerVars = opts.buyerId?.trim() ? idMatchVariantsForIn(opts.buyerId.trim()) : null;

  let gateQ = supabase.from("listing_service_contact_gate").select("listing_id", { count: "exact", head: true }).in("listing_id", listVars);
  if (buyerVars?.length) gateQ = gateQ.in("buyer_id", buyerVars);
  const { count: contactGateRows, error: gateErr } = await gateQ;
  if (gateErr) throw new Error(gateErr.message);

  const { data: convs, error: convErr } = await supabase
    .from("listing_conversations")
    .select("id")
    .in("listing_id", listVars);
  if (convErr) throw new Error(convErr.message);
  const convIds = (convs ?? []).map((c) => String(c.id));

  let messageRows = 0;
  if (convIds.length > 0) {
    const { count, error: msgErr } = await supabase
      .from("listing_messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds);
    if (msgErr) throw new Error(msgErr.message);
    messageRows = count ?? 0;
  }

  let bookQ = supabase
    .from("service_bookings")
    .select("id", { count: "exact", head: true })
    .in("listing_id", listVars)
    .in("status", ["pending", "confirmed", "scheduled", "in_progress"]);
  if (buyerVars?.length) bookQ = bookQ.in("buyer_id", buyerVars);
  const { count: openBookings, error: bookErr } = await bookQ;
  if (bookErr) throw new Error(bookErr.message);

  return {
    listingIds,
    listings,
    contactGateRows: contactGateRows ?? 0,
    messageRows,
    openBookings: openBookings ?? 0,
  };
}

export async function executeQuoteTestReset(
  supabase: SupabaseClient,
  opts: QuoteTestResetOptions = {},
): Promise<QuoteTestResetPreview & { reset: true }> {
  const preview = await previewQuoteTestReset(supabase, opts);
  if (preview.listingIds.length === 0) return { ...preview, reset: true };

  const listVars = [...new Set(preview.listingIds.flatMap((id) => idMatchVariantsForIn(id)))];
  const buyerVars = opts.buyerId?.trim() ? idMatchVariantsForIn(opts.buyerId.trim()) : null;
  const now = new Date().toISOString();

  let gateUp = supabase
    .from("listing_service_contact_gate")
    .update({
      quote_status: "none",
      quote_line_items: null,
      quote_metadata: null,
      agreed_subtotal_mxn_cents: null,
      seller_set_agreed_price_at: null,
      quote_sent_at: null,
      quote_responded_at: null,
      contacted_in_app: false,
      updated_at: now,
    })
    .in("listing_id", listVars);
  if (buyerVars?.length) gateUp = gateUp.in("buyer_id", buyerVars);
  const { error: gateErr } = await gateUp;
  if (gateErr) throw new Error(`contact_gate reset: ${gateErr.message}`);

  if (opts.clearMessages !== false) {
    const { data: convs, error: convErr } = await supabase
      .from("listing_conversations")
      .select("id")
      .in("listing_id", listVars);
    if (convErr) throw new Error(convErr.message);
    const convIds = (convs ?? []).map((c) => String(c.id));
    if (convIds.length > 0) {
      const { error: msgErr } = await supabase.from("listing_messages").delete().in("conversation_id", convIds);
      if (msgErr) throw new Error(`messages delete: ${msgErr.message}`);
    }
  }

  if (opts.cancelOpenBookings !== false) {
    let bookUp = supabase
      .from("service_bookings")
      .update({ status: "cancelled", updated_at: now })
      .in("listing_id", listVars)
      .in("status", ["pending", "confirmed", "scheduled", "in_progress"]);
    if (buyerVars?.length) bookUp = bookUp.in("buyer_id", buyerVars);
    const { error: bookErr } = await bookUp;
    if (bookErr) throw new Error(`bookings cancel: ${bookErr.message}`);
  }

  return { ...(await previewQuoteTestReset(supabase, opts)), reset: true };
}
