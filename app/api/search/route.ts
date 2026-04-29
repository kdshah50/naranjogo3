import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { embeddedSellerRow } from "@/lib/seller-trust-display";
import { COLONIAS, detectColoniaInQuery, COLONIA_RADIUS_KM } from "@/lib/colonias";
import {
  listingMatchesPriceFilters,
  parseSearchQuery,
  type ParsedQueryFilters,
} from "@/lib/search-query-parse";
import { sparseSearchTokens } from "@/lib/search-trade-hints";

/**
 * Hybrid retrieval (what is / isn’t implemented here):
 *
 * | Layer        | Implemented | Notes |
 * |--------------|-------------|-------|
 * | Sparse       | Yes         | OR’d `title_es` ILIKE + bilingual trade tokens (not BM25 / tsvector). |
 * | Vector       | Yes         | OpenAI `text-embedding-3-small` + RPC `search_listings_dense`. |
 * | Fusion       | Yes         | RRF + cosine-aware dense weight + optional geo multiplier. |
 * | Price        | Yes         | NL + `pmin`/`pmax` → centavos bounds on Supabase + post-filter. |
 * | Location     | Partial     | Colonia = strict radius; `lat`/`lng` = boost only (not hard filter). |
 * | Availability | No          | “Urgent/today” ignored for price; no calendar/slots filter in search. |
 * | Buyer intent | Partial     | LLM + regex keyword/semantic; trade hints for EN/ES → Spanish titles. |
 * | Seller SEO   | Partial     | Embeddings from listing text in DB; no BM25 index or guided copy API here. |
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const SMA_ZIP = "37745";

/** Drop weak vector matches (reduces unrelated trades when every listing is vaguely similar). */
const ABS_THRESHOLD = 0.26;
/** Share of top cosine required (stricter → fewer "wrong trade" neighbors). */
const REL_FACTOR = 0.83;
/** Must stay within this cosine gap of the best match. */
const BEST_SIM_MARGIN = 0.13;

async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 2000) }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

function geoBoost(km: number) {
  if (km < 2) return 2.0; if (km < 5) return 1.5; if (km < 10) return 1.2; return 1.0;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function rrf(rank: number, k = 60) { return 1 / (k + rank + 1); }

function parsePesosParam(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Slider / URL caps (whole MXN) tighten NL-parsed price bounds. */
function mergeUiPricePesosIntoParsed(
  parsed: ParsedQueryFilters,
  pminPesos?: number,
  pmaxPesos?: number,
): ParsedQueryFilters {
  const out: ParsedQueryFilters = { ...parsed };
  if (pminPesos != null && pminPesos > 0) {
    const c = pminPesos * 100;
    out.minPriceMxnCents = out.minPriceMxnCents != null ? Math.max(out.minPriceMxnCents, c) : c;
  }
  if (pmaxPesos != null && pmaxPesos > 0) {
    const c = pmaxPesos * 100;
    out.maxPriceMxnCents =
      out.maxPriceMxnCents != null ? Math.min(out.maxPriceMxnCents, c) : c;
  }
  return out;
}

const SELECT_COLS_FULL = "id,title_es,price_mxn,category_id,condition,location_city,location_lat,location_lng,shipping_available,negotiable,photo_urls,payment_methods,users!fk_listings_seller(display_name,trust_badge,ine_verified,rfc_verified,phone_verified)";
const SELECT_COLS_BASE = "id,title_es,price_mxn,category_id,condition,location_city,location_lat,location_lng,shipping_available,negotiable,photo_urls,users!fk_listings_seller(display_name,trust_badge,ine_verified,rfc_verified,phone_verified)";

const USER_EMBED_SELECT =
  "id,users!fk_listings_seller(display_name,trust_badge,ine_verified,rfc_verified,phone_verified)";

/** Dense / RPC rows often omit `users`; attach seller embed so listing cards can show trust badges. */
async function enrichResultsWithSellerUsers(
  listings: any[],
  supaUrl: string,
  headers: Record<string, string>
) {
  const need = listings.filter((l) => {
    const u = l?.users;
    return !u || (typeof u === "object" && u !== null && !("display_name" in u));
  });
  const ids = [...new Set(need.map((l) => l.id).filter(Boolean))];
  if (!ids.length) return;

  const inList = ids.join(",");
  const url = `${supaUrl}/rest/v1/listings?id=in.(${inList})&select=${encodeURIComponent(USER_EMBED_SELECT)}`;
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return;
    const raw = await res.json();
    const rows: any[] = Array.isArray(raw) ? raw : [];
    const byId = new Map(rows.map((r) => [r.id, r.users]));
    for (const l of listings) {
      const u = byId.get(l.id);
      if (u != null) {
        l.users = embeddedSellerRow(u as Record<string, unknown> | Record<string, unknown>[]) ?? u;
      }
    }
  } catch {
    /* non-fatal */
  }
}

export async function GET(req: NextRequest) {
  const supaUrl = getSupabaseUrl();
  const headers = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" };
  const { searchParams } = new URL(req.url);
  let query        = (searchParams.get("q") ?? "").trim();
  const category   = searchParams.get("category") ?? "services";
  let coloniaKey   = searchParams.get("colonia") ?? "";
  const lat        = parseFloat(searchParams.get("lat") ?? "NaN");
  const lng        = parseFloat(searchParams.get("lng") ?? "NaN");
  let hasGeo       = !isNaN(lat) && !isNaN(lng);
  const pminPesos  = parsePesosParam(searchParams.get("pmin"));
  const pmaxPesos  = parsePesosParam(searchParams.get("pmax"));

  if (!coloniaKey && query) {
    const detected = detectColoniaInQuery(query);
    if (detected) {
      coloniaKey = detected.coloniaKey;
      query = detected.cleanedQuery || query;
    }
  }

  const coloniaRef = coloniaKey ? COLONIAS[coloniaKey] : null;

  let sparseRows: any[] = [];
  let denseRows:  any[] = [];
  let denseFilterDebug: { bestSimilarity: number; thresholdUsed: number } | null = null;

  let parsed: ParsedQueryFilters = {
    keywordForSparse: query,
    textForEmbedding: query,
    source: "none",
  };
  if (query) {
    parsed = await parseSearchQuery(query, category);
    if (!parsed.keywordForSparse.trim()) {
      parsed = { ...parsed, keywordForSparse: query };
    }
    if (!parsed.textForEmbedding.trim()) {
      parsed = { ...parsed, textForEmbedding: query };
    }
  }

  const sparsePhrase = parsed.keywordForSparse.trim() || query;
  const embedPhrase = parsed.textForEmbedding.trim() || query;

  const effective = mergeUiPricePesosIntoParsed(parsed, pminPesos, pmaxPesos);

  function appendPriceToUrl(base: string): string {
    let u = base;
    if (effective.maxPriceMxnCents != null) {
      u += `&price_mxn=lte.${effective.maxPriceMxnCents}`;
    }
    if (effective.minPriceMxnCents != null) {
      u += `&price_mxn=gte.${effective.minPriceMxnCents}`;
    }
    return u;
  }

  async function fetchWithFallback(url: string, selectFull: string, selectBase: string) {
    let res = await fetch(url.replace(selectFull, selectFull), { headers, cache: "no-store" });
    if (res.ok) return res.json();
    res = await fetch(url.replace(selectFull, selectBase), { headers, cache: "no-store" });
    return res.ok ? res.json() : [];
  }

  if (query) {
    // ── Layer 1: Sparse keyword search (OR on Spanish trade tokens + query words) ──
    try {
      const hasPrice = effective.maxPriceMxnCents != null || effective.minPriceMxnCents != null;
      const keywordTooShort = !sparsePhrase || sparsePhrase.trim().length < 2;
      const titleTokens = sparseSearchTokens(query, sparsePhrase);
      const priceOnlyBrowse = hasPrice && keywordTooShort && titleTokens.length === 0;

      const listBase = `status=eq.active&is_verified=eq.true&category_id=eq.${category}&select=${SELECT_COLS_FULL}`;
      let core: string;
      if (priceOnlyBrowse) {
        core = `${supaUrl}/rest/v1/listings?${listBase}&order=created_at.desc&limit=24`;
      } else if (titleTokens.length === 0) {
        const p = (sparsePhrase || query).trim();
        core =
          p.length >= 2
            ? `${supaUrl}/rest/v1/listings?${listBase}&title_es=ilike.*${encodeURIComponent(p)}*&limit=20`
            : `${supaUrl}/rest/v1/listings?${listBase}&order=created_at.desc&limit=24`;
      } else if (titleTokens.length === 1) {
        core = `${supaUrl}/rest/v1/listings?${listBase}&title_es=ilike.*${encodeURIComponent(titleTokens[0])}*&limit=24`;
      } else {
        const orInner = titleTokens
          .map((t) => `title_es.ilike.*${encodeURIComponent(t)}*`)
          .join(",");
        core = `${supaUrl}/rest/v1/listings?${listBase}&or=(${orInner})&limit=36`;
      }
      const baseUrl = appendPriceToUrl(core);
      sparseRows = await fetchWithFallback(baseUrl, SELECT_COLS_FULL, SELECT_COLS_BASE);
      sparseRows = sparseRows.filter((l) => listingMatchesPriceFilters(l.price_mxn, effective));
    } catch {}

    // ── Layer 2: Dense semantic search ──────────────────────────────────────
    try {
      const vec = await embedQuery(embedPhrase);
      if (vec) {
        const dr = await fetch(`${supaUrl}/rest/v1/rpc/search_listings_dense`, {
          method: "POST", headers,
          body: JSON.stringify({ query_embedding: vec, category_filter: category, match_count: 40 }),
          cache: "no-store",
        });
        const data = dr.ok ? await dr.json() : [];
        if (Array.isArray(data) && data.length > 0) {
          const bestScore = Math.max(...data.map((l: any) => l.similarity ?? 0));
          const threshold = Math.max(
            ABS_THRESHOLD,
            bestScore * REL_FACTOR,
            bestScore - BEST_SIM_MARGIN
          );
          denseRows = data
            .filter((l: any) => (l.similarity ?? 0) >= threshold)
            .filter((l: any) => listingMatchesPriceFilters(l.price_mxn, effective));
          denseFilterDebug = { bestSimilarity: bestScore, thresholdUsed: threshold };
        }
      }
    } catch {}

  } else {
    // No query — return all active services
    try {
      let baseUrl = `${supaUrl}/rest/v1/listings?status=eq.active&is_verified=eq.true&category_id=eq.${category}&select=${SELECT_COLS_FULL}&order=created_at.desc&limit=24`;
      baseUrl = appendPriceToUrl(baseUrl);
      sparseRows = await fetchWithFallback(baseUrl, SELECT_COLS_FULL, SELECT_COLS_BASE);
      sparseRows = sparseRows.filter((l) => listingMatchesPriceFilters(l.price_mxn, effective));
    } catch {}
  }

  // ── RRF fusion + geo boost ─────────────────────────────────────────────────
  type Entry = { listing: any; sparse: number; dense: number; geo: number };
  const map = new Map<string, Entry>();

  sparseRows.forEach((l, i) => map.set(l.id, { listing: l, sparse: rrf(i), dense: 0, geo: 1 }));
  denseRows.forEach((l, i) => {
    const e = map.get(l.id);
    const denseSim =
      typeof l.similarity === "number" && Number.isFinite(l.similarity) ? l.similarity : undefined;
    if (e) {
      e.dense = rrf(i);
      // Sparse rows omit `similarity`; without this, fused score treats hybrids as cosine 0.
      if (denseSim != null) e.listing = { ...e.listing, similarity: denseSim };
    } else {
      map.set(l.id, { listing: l, sparse: 0, dense: rrf(i), geo: 1 });
    }
  });

  if (hasGeo) {
    map.forEach(e => {
      const { location_lat: lt, location_lng: ln } = e.listing;
      if (lt && ln) {
        const km = haversineKm(lat, lng, lt, ln);
        e.listing._dist_km = Math.round(km * 10) / 10;
        e.geo = geoBoost(km);
      }
    });
  }

  let fused = Array.from(map.values()).map(({ listing, sparse, dense, geo }) => {
    const sim =
      typeof listing.similarity === "number" && Number.isFinite(listing.similarity)
        ? Math.min(1, Math.max(0, listing.similarity))
        : 0;
    const denseWeighted = dense > 0 ? dense * (0.45 + 0.55 * sim) : 0;
    const simRankBoost = dense > 0 ? sim * 0.22 : 0;
    return {
      ...listing,
      _score:
        Math.round((sparse * 0.38 + denseWeighted * 0.42 + simRankBoost) * geo * 10000) / 10000,
      _mode: dense > 0 && sparse > 0 ? "hybrid" : dense > 0 ? "dense" : "sparse",
    };
  });

  if (coloniaRef) {
    fused = fused.filter((l) => {
      const lt = l.location_lat; const ln = l.location_lng;
      if (!lt || !ln) return false;
      return haversineKm(coloniaRef.lat, coloniaRef.lng, lt, ln) <= COLONIA_RADIUS_KM;
    });
  }

  fused = fused.filter((l) => listingMatchesPriceFilters(l.price_mxn, effective));

  const results = fused
    .sort((a, b) => b._score - a._score)
    .slice(0, 24);

  await enrichResultsWithSellerUsers(results, supaUrl, headers);

  const mode = denseRows.length > 0 ? "hybrid" : sparseRows.length > 0 ? "sparse" : "empty";
  const debug = {
    hasOpenAIKey: !!OPENAI_KEY,
    sparseCount: sparseRows.length,
    denseCount: denseRows.length,
    denseFilter: denseFilterDebug,
    bestSimMargin: BEST_SIM_MARGIN,
    relFactor: REL_FACTOR,
    /** Set by Vercel at build time — use to confirm this deployment matches Git. */
    vercelGitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    parse: {
      source: parsed.source,
      keywordForSparse: sparsePhrase,
      sparseTokens: sparseSearchTokens(query, sparsePhrase),
      textForEmbedding: embedPhrase,
      maxPriceMxnCents: effective.maxPriceMxnCents ?? null,
      minPriceMxnCents: effective.minPriceMxnCents ?? null,
      pminPesos: pminPesos ?? null,
      pmaxPesos: pmaxPesos ?? null,
    },
  };

  return NextResponse.json({
    results, mode, query, total: results.length, debug,
    colonia: coloniaRef ? { key: coloniaKey, label: coloniaRef.label } : null,
  });
}
