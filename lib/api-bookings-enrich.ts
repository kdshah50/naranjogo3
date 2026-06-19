import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalBookingRowIdKey } from "@/lib/booking-list-merge";
import { expandUserAccountIdPool } from "@/lib/user-account-pool";
import { chunkArray, POSTGREST_IN_VALUE_CHUNK } from "@/lib/postgrest-in-chunks";
import { idMatchVariantsForIn } from "@/lib/user-id-variants";
import { listingChatPath } from "@/lib/listing-chat-deep-link";
import { loadSellerConnectId } from "@/lib/marketplace-cart-server";
import { sellerConnectPayoutReady } from "@/lib/stripe-connect-ready";

type BookingRow = Record<string, unknown>;

/**
 * `seller_reviews.booking_id` matches `service_bookings.id` — variant lists can be huge; chunk `.in()`.
 */
export async function loadReviewedBookingIdSet(
  supabase: SupabaseClient,
  bookingRows: BookingRow[],
): Promise<Set<string>> {
  const bookingIdVariants = [...new Set(bookingRows.flatMap((b) => idMatchVariantsForIn(String(b.id))))];
  const reviewed = new Set<string>();
  for (const part of chunkArray(bookingIdVariants, POSTGREST_IN_VALUE_CHUNK)) {
    if (part.length === 0) continue;
    const { data: revRows, error } = await supabase
      .from("seller_reviews")
      .select("booking_id")
      .in("booking_id", part);
    if (error) {
      console.error("[api/bookings] seller_reviews.in chunk failed", error.message, { chunkLen: part.length });
      continue;
    }
    for (const r of revRows ?? []) {
      if (r.booking_id) reviewed.add(canonicalBookingRowIdKey(r.booking_id));
    }
  }
  return reviewed;
}

/** Batched listing titles: one round-trip per chunk instead of N per row. */
async function loadListingTitlesById(
  supabase: SupabaseClient,
  bookingRows: BookingRow[],
): Promise<Map<string, string>> {
  const uniqueRoots = [...new Set(bookingRows.map((b) => canonicalBookingRowIdKey(String(b.listing_id))))].filter(
    Boolean,
  );
  const titleByListingKey = new Map<string, string>();
  /** Up to ~26 roots × 3 variants ≈ 78 per request */
  const listingRootChunk = 26;
  for (const roots of chunkArray(uniqueRoots, listingRootChunk)) {
    const vars = [...new Set(roots.flatMap((id) => idMatchVariantsForIn(id)))];
    if (vars.length === 0) continue;
    const { data: rows, error } = await supabase.from("listings").select("id, title_es").in("id", vars);
    if (error) {
      console.error("[api/bookings] listings enrich chunk failed", error.message, { variantLen: vars.length });
      continue;
    }
    for (const row of rows ?? []) {
      titleByListingKey.set(canonicalBookingRowIdKey(row.id), String(row.title_es ?? "").trim() || "Servicio");
    }
  }
  return titleByListingKey;
}

async function displayNameForAccountRoots(
  supabase: SupabaseClient,
  accountRootIds: string[],
  fallback: string,
): Promise<Map<string, string>> {
  const uniqueRoots = [...new Set(accountRootIds.map((id) => canonicalBookingRowIdKey(id)))].filter(Boolean);
  const poolByRoot = new Map<string, string[]>();
  for (const root of uniqueRoots) {
    poolByRoot.set(root, await expandUserAccountIdPool(supabase, root));
  }
  const allMemberVariants = [...new Set([...poolByRoot.values()].flatMap((p) => p.flatMap((m) => idMatchVariantsForIn(m))))];
  const displayByMemberKey = new Map<string, string>();
  for (const part of chunkArray(allMemberVariants, POSTGREST_IN_VALUE_CHUNK)) {
    if (part.length === 0) continue;
    const { data: userRows, error } = await supabase.from("users").select("id, display_name").in("id", part);
    if (error) {
      console.error("[api/bookings] users enrich chunk failed", error.message, { chunkLen: part.length });
      continue;
    }
    for (const u of userRows ?? []) {
      const dn = String(u.display_name ?? "").trim();
      if (dn) displayByMemberKey.set(canonicalBookingRowIdKey(u.id), dn);
    }
  }
  const nameByRoot = new Map<string, string>();
  for (const root of uniqueRoots) {
    const pool = poolByRoot.get(root) ?? [];
    let name = fallback;
    for (const m of pool) {
      const k = canonicalBookingRowIdKey(m);
      const hit = displayByMemberKey.get(k);
      if (hit) {
        name = hit;
        break;
      }
    }
    nameByRoot.set(root, name);
  }
  return nameByRoot;
}

/** Batch: seller account root → can receive housekeeping balance in-app (Stripe-verified). */
async function loadSellerConnectReadyByRoot(
  supabase: SupabaseClient,
  bookingRows: BookingRow[],
): Promise<Map<string, boolean>> {
  const sellerRoots = new Set<string>();
  for (const b of bookingRows) {
    if (String(b.status ?? "") !== "completed") continue;
    if (String(b.balance_payment_status ?? "") !== "pending") continue;
    const root = canonicalBookingRowIdKey(String(b.seller_id ?? ""));
    if (root) sellerRoots.add(root);
  }
  const readyByRoot = new Map<string, boolean>();
  await Promise.all(
    [...sellerRoots].map(async (root) => {
      const status = await sellerConnectPayoutReady(supabase, root);
      readyByRoot.set(root, status.payoutReady);
    }),
  );
  return readyByRoot;
}

/** Legacy: linked acct_ id only (no Stripe verify). Used when balance not pending. */
async function loadSellerConnectLinkedByRoot(
  supabase: SupabaseClient,
  sellerRootIds: string[],
): Promise<Map<string, boolean>> {
  const uniqueRoots = [...new Set(sellerRootIds.map((id) => canonicalBookingRowIdKey(id)))].filter(Boolean);
  const linkedByRoot = new Map<string, boolean>();
  await Promise.all(
    uniqueRoots.map(async (root) => {
      linkedByRoot.set(root, Boolean(await loadSellerConnectId(supabase, root)));
    }),
  );
  return linkedByRoot;
}

/** Map `listingId|buyerRoot` → conversation id for seller booking list chat links. */
async function loadConversationIdsForSellerRows(
  supabase: SupabaseClient,
  bookingRows: BookingRow[],
): Promise<Map<string, string>> {
  const pairKeys = new Set<string>();
  const listingVarsAll: string[] = [];
  const buyerPoolMembers: string[] = [];

  const buyerPoolByRoot = new Map<string, string[]>();
  for (const b of bookingRows) {
    const listingRoot = canonicalBookingRowIdKey(String(b.listing_id ?? ""));
    const buyerRoot = canonicalBookingRowIdKey(String(b.buyer_id ?? ""));
    if (!listingRoot || !buyerRoot) continue;
    pairKeys.add(`${listingRoot}|${buyerRoot}`);
    if (!buyerPoolByRoot.has(buyerRoot)) {
      buyerPoolByRoot.set(buyerRoot, await expandUserAccountIdPool(supabase, buyerRoot));
    }
    const pool = buyerPoolByRoot.get(buyerRoot) ?? [];
    listingVarsAll.push(...idMatchVariantsForIn(String(b.listing_id)));
    buyerPoolMembers.push(...pool);
  }

  const convByPair = new Map<string, string>();
  if (pairKeys.size === 0) return convByPair;

  const listingIn = [...new Set(listingVarsAll)];
  const buyerIn = [...new Set(buyerPoolMembers.flatMap((m) => idMatchVariantsForIn(m)))];

  if (listingIn.length === 0 || buyerIn.length === 0) return convByPair;

  const { data: convRows, error } = await supabase
    .from("listing_conversations")
    .select("id,listing_id,buyer_id,updated_at")
    .in("listing_id", listingIn.slice(0, POSTGREST_IN_VALUE_CHUNK))
    .in("buyer_id", buyerIn.slice(0, POSTGREST_IN_VALUE_CHUNK))
    .order("updated_at", { ascending: false })
    .limit(400);

  if (error) {
    console.error("[api/bookings] listing_conversations enrich failed", error.message);
    return convByPair;
  }

  const memberToRoot = new Map<string, string>();
  for (const [root, pool] of buyerPoolByRoot) {
    for (const m of pool) memberToRoot.set(canonicalBookingRowIdKey(m), root);
  }

  for (const c of convRows ?? []) {
    const listingRoot = canonicalBookingRowIdKey(String(c.listing_id));
    const buyerRoot = memberToRoot.get(canonicalBookingRowIdKey(String(c.buyer_id)));
    if (!listingRoot || !buyerRoot) continue;
    const pair = `${listingRoot}|${buyerRoot}`;
    if (!pairKeys.has(pair) || convByPair.has(pair)) continue;
    convByPair.set(pair, String(c.id));
  }

  return convByPair;
}

/**
 * Enrich booking list rows without O(rows) listing/user round-trips (critical past ~50 rows).
 */
export async function enrichBookingListRows(
  supabase: SupabaseClient,
  bookingRows: BookingRow[],
  sellerMode: boolean,
  reviewedSet: Set<string>,
): Promise<Record<string, unknown>[]> {
  if (bookingRows.length === 0) return [];

  const listingTitles = await loadListingTitlesById(supabase, bookingRows);

  const buyerRoots = sellerMode ? bookingRows.map((b) => String(b.buyer_id ?? "")) : [];
  const sellerRoots = sellerMode ? [] : bookingRows.map((b) => String(b.seller_id ?? ""));

  const buyerNameByRoot =
    sellerMode && buyerRoots.length > 0
      ? await displayNameForAccountRoots(supabase, buyerRoots, "Comprador")
      : new Map<string, string>();
  const sellerNameByRoot =
    !sellerMode && sellerRoots.length > 0
      ? await displayNameForAccountRoots(supabase, sellerRoots, "Proveedor")
      : new Map<string, string>();

  const convByPair = sellerMode ? await loadConversationIdsForSellerRows(supabase, bookingRows) : new Map<string, string>();

  const sellerConnectByRoot =
    !sellerMode && bookingRows.length > 0
      ? await loadSellerConnectReadyByRoot(supabase, bookingRows)
      : new Map<string, boolean>();

  const sellerLinkedByRoot =
    !sellerMode && bookingRows.length > 0
      ? await loadSellerConnectLinkedByRoot(
          supabase,
          bookingRows.map((b) => String(b.seller_id ?? "")),
        )
      : new Map<string, boolean>();

  return bookingRows.map((b) => {
    const listingKey = canonicalBookingRowIdKey(String(b.listing_id));
    const listing_title = listingTitles.get(listingKey) ?? "Servicio";
    const bookingKey = canonicalBookingRowIdKey(b.id);
    const has_review = reviewedSet.has(bookingKey);

    if (sellerMode) {
      const br = canonicalBookingRowIdKey(String(b.buyer_id ?? ""));
      const lr = canonicalBookingRowIdKey(String(b.listing_id ?? ""));
      const buyer_name = buyerNameByRoot.get(br) ?? "Comprador";
      const convId = convByPair.get(`${lr}|${br}`);
      const listing_chat_path = listingChatPath(String(b.listing_id), convId);
      return { ...b, has_review, listing_title, buyer_name, listing_chat_path };
    }
    const sr = canonicalBookingRowIdKey(String(b.seller_id ?? ""));
    const seller_name = sellerNameByRoot.get(sr) ?? "Proveedor";
    const seller_connect_ready =
      sellerConnectByRoot.get(sr) ?? sellerLinkedByRoot.get(sr) ?? false;
    return { ...b, has_review, listing_title, seller_name, seller_connect_ready };
  });
}
