import type { SupabaseClient } from "@supabase/supabase-js";

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const EMBED_MODEL = process.env.SEARCH_EMBED_MODEL ?? "text-embedding-3-small";

export type ListingEmbedParts = {
  title_es?: string | null;
  description_es?: string | null;
  description_en?: string | null;
};

/** Text stored as the listing vector (Spanish-first + English description when present). */
export function listingEmbeddingText(parts: ListingEmbedParts): string {
  const title = String(parts.title_es ?? "").trim();
  const descEs = String(parts.description_es ?? "").trim();
  const descEn = String(parts.description_en ?? "").trim();
  return [title, descEs, descEn].filter(Boolean).join("\n").slice(0, 8000);
}

/** OpenAI embedding for search queries and listing catalog rows. */
export async function embedText(text: string): Promise<number[] | null> {
  const input = text.trim().slice(0, 8000);
  if (!OPENAI_KEY || !input) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[listing-embedding] OpenAI", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const vector = data.data?.[0]?.embedding;
    return Array.isArray(vector) ? vector : null;
  } catch (e) {
    console.error("[listing-embedding] embedText", e);
    return null;
  }
}

export async function storeListingEmbedding(
  supabase: SupabaseClient,
  listingId: string,
  vector: number[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("listings").update({ embedding: vector }).eq("id", listingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function embedAndStoreListing(
  supabase: SupabaseClient,
  listingId: string,
  parts: ListingEmbedParts,
): Promise<{ ok: boolean; error?: string; dims?: number }> {
  const text = listingEmbeddingText(parts);
  if (!text) return { ok: false, error: "empty listing text" };

  const vector = await embedText(text);
  if (!vector) return { ok: false, error: "embedding failed (check OPENAI_API_KEY)" };

  const stored = await storeListingEmbedding(supabase, listingId, vector);
  if (!stored.ok) return stored;
  return { ok: true, dims: vector.length };
}

/** Fire-and-forget embed for API routes (logs failures). */
export function embedListingInBackground(
  supabase: SupabaseClient,
  listingId: string,
  parts: ListingEmbedParts,
): void {
  void embedAndStoreListing(supabase, listingId, parts).then((r) => {
    if (!r.ok) {
      console.error(`[listing-embedding] ${listingId.slice(0, 8)}…`, r.error);
    }
  });
}
