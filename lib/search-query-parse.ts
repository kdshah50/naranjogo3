/**
 * Turn free-text search (EN/ES) into structured hints: price caps/floors + cleaner keyword/embedding strings.
 * Used by /api/search — LLM when OPENAI_API_KEY is set, else regex heuristics.
 */

import { embeddingContextSuffix } from "@/lib/search-trade-hints";

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const CHAT_MODEL = process.env.SEARCH_PARSE_MODEL ?? "gpt-4o-mini";
/** Whole pesos per 1 USD when user says "dollars" / "usd" without MXN. */
const MXN_PER_USD = Math.max(1, parseFloat(process.env.SEARCH_MXN_PER_USD ?? "17.5") || 17.5);

export type ParsedQueryFilters = {
  maxPriceMxnCents?: number;
  minPriceMxnCents?: number;
  /** Short phrase for title ilike (no price junk). */
  keywordForSparse: string;
  /** Fuller line for embedding similarity. */
  textForEmbedding: string;
  source: "llm" | "regex" | "none";
};

function pesosToCentavos(wholePesos: number): number {
  if (!Number.isFinite(wholePesos) || wholePesos < 0) return 0;
  return Math.round(wholePesos * 100);
}

function parseNumber(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Regex extraction: "under $50", "menos de 500 pesos", "max 900 mxn", "less than 1000 usd".
 * Strips matched segments from the query for keyword search.
 */
export function regexParseSearchQuery(input: string): ParsedQueryFilters {
  let rest = input.trim();
  let maxPesos: number | undefined;
  let minPesos: number | undefined;

  const priceClause =
    /\b(under|below|less\s+than|menos\s+de|hasta|máximo|maximo|max|at\s+most|por\s+menos\s+de)\s*\$?\s*([\d,.]+)\s*(usd|us\s*\$|dollars?|dlls?|mxn|mx\$|pesos?)?\b/gi;
  const priceClauseMin =
    /\b(over|above|more\s+than|más\s+de|al\s+menos|min|minimum|at\s+least|desde)\s*\$?\s*([\d,.]+)\s*(usd|us\s*\$|dollars?|dlls?|mxn|mx\$|pesos?)?\b/gi;
  const priceLessNumber =
    /\b<\s*\$?\s*([\d,.]+)\s*(usd|mxn|pesos?)?\b/gi;

  const applyMax = (amount: number, unit?: string) => {
    const u = (unit ?? "").toLowerCase();
    const isUsd = /\b(usd|us|dollar|dll)\b/.test(u) || u === "$";
    const pesos = isUsd ? amount * MXN_PER_USD : amount;
    if (!Number.isFinite(pesos)) return;
    maxPesos = maxPesos === undefined ? pesos : Math.min(maxPesos, pesos);
  };

  const applyMin = (amount: number, unit?: string) => {
    const u = (unit ?? "").toLowerCase();
    const isUsd = /\b(usd|us|dollar|dll)\b/.test(u) || u === "$";
    const pesos = isUsd ? amount * MXN_PER_USD : amount;
    if (!Number.isFinite(pesos)) return;
    minPesos = minPesos === undefined ? pesos : Math.max(minPesos, pesos);
  };

  rest = rest.replace(priceClause, (_, _op, num, unit) => {
    const amount = parseNumber(num);
    if (!Number.isNaN(amount)) applyMax(amount, unit);
    return " ";
  });
  rest = rest.replace(priceClauseMin, (_, _op, num, unit) => {
    const amount = parseNumber(num);
    if (!Number.isNaN(amount)) applyMin(amount, unit);
    return " ";
  });
  rest = rest.replace(priceLessNumber, (_, num, unit) => {
    const amount = parseNumber(num);
    if (!Number.isNaN(amount)) applyMax(amount, unit);
    return " ";
  });

  const keywordForSparse = rest.replace(/\s+/g, " ").trim() || input.trim();
  const textForEmbedding = input.trim();

  const out: ParsedQueryFilters = {
    keywordForSparse,
    textForEmbedding,
    source: maxPesos !== undefined || minPesos !== undefined ? "regex" : "none",
  };
  if (maxPesos !== undefined) out.maxPriceMxnCents = pesosToCentavos(maxPesos);
  if (minPesos !== undefined) out.minPriceMxnCents = pesosToCentavos(minPesos);
  return out;
}

type LlmExtract = {
  keyword_phrase?: string | null;
  semantic_query?: string | null;
  max_price_mxn?: number | null;
  min_price_mxn?: number | null;
};

async function llmParseSearchQuery(query: string, category: string): Promise<ParsedQueryFilters | null> {
  if (!OPENAI_KEY || !query.trim()) return null;

  const system = `You extract search filters for a Mexican marketplace (Spanish-first listings; bilingual queries EN/ES).

Return ONLY valid JSON with keys:
- keyword_phrase: 4–12 words for SQL ILIKE on title_es. MUST include Spanish trade words sellers use. If the user wrote English OR Spanish, output the SAME Spanish seller keywords (never English-only). Examples: sink/fregadero/fuga/grifería → "fontanero plomero plomería tuberías"; wiring/focos → "electricista eléctrico"; dental/muelas → "dentista odontólogo"; pintar bardas → "pintor pintura".
- semantic_query: One precise sentence for vector similarity naming trade + task. Prefer Spanish; English acceptable. Narrow intent—avoid vague "professional" / "service" alone.
- max_price_mxn: maximum price in whole MXN pesos (integer), or null if not stated.
- min_price_mxn: minimum price in whole MXN pesos (integer), or null if not stated.

Rules:
- Match trade precisely: plumbing ≠ electrical ≠ dental ≠ cleaning—pick keywords ONLY for what the user asked for.
- If the user gives USD or "dollars" without saying MXN/pesos, convert to MXN using ${MXN_PER_USD} MXN per USD.
- "Under $50" with dollar context → max_price_mxn = floor(50 * ${MXN_PER_USD}).
- Ignore availability words like "today", "now", "urgent" for price (leave price null unless a number is given).
- category hint (for context only): ${category}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: query.slice(0, 2000) },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return null;

    let parsed: LlmExtract;
    try {
      parsed = JSON.parse(raw) as LlmExtract;
    } catch {
      return null;
    }

    const keyword =
      typeof parsed.keyword_phrase === "string" && parsed.keyword_phrase.trim()
        ? parsed.keyword_phrase.trim()
        : query.trim();
    const semantic =
      typeof parsed.semantic_query === "string" && parsed.semantic_query.trim()
        ? parsed.semantic_query.trim()
        : query.trim();

    const out: ParsedQueryFilters = {
      keywordForSparse: keyword,
      textForEmbedding: semantic,
      source: "llm",
    };

    if (parsed.max_price_mxn != null && Number.isFinite(Number(parsed.max_price_mxn))) {
      out.maxPriceMxnCents = pesosToCentavos(Math.floor(Number(parsed.max_price_mxn)));
    }
    if (parsed.min_price_mxn != null && Number.isFinite(Number(parsed.min_price_mxn))) {
      out.minPriceMxnCents = pesosToCentavos(Math.ceil(Number(parsed.min_price_mxn)));
    }

    return out;
  } catch {
    return null;
  }
}

/** Merge LLM + regex: regex can fill price if LLM omitted; prefer LLM keyword/semantic when present. */
export async function parseSearchQuery(query: string, category: string): Promise<ParsedQueryFilters> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { keywordForSparse: "", textForEmbedding: "", source: "none" };
  }

  const rx = regexParseSearchQuery(trimmed);
  const llm = await llmParseSearchQuery(trimmed, category);

  if (!llm) {
    const base =
      rx.source === "none"
        ? { ...rx, keywordForSparse: trimmed, textForEmbedding: trimmed }
        : rx;
    const hint = embeddingContextSuffix(trimmed);
    if (!hint) return base;
    return {
      ...base,
      textForEmbedding: `${base.textForEmbedding} ${hint}`.trim().slice(0, 2000),
    };
  }

  const merged: ParsedQueryFilters = {
    keywordForSparse: llm.keywordForSparse || trimmed,
    textForEmbedding: llm.textForEmbedding || trimmed,
    source: "llm",
    maxPriceMxnCents: llm.maxPriceMxnCents ?? rx.maxPriceMxnCents,
    minPriceMxnCents: llm.minPriceMxnCents ?? rx.minPriceMxnCents,
  };

  if (merged.maxPriceMxnCents != null && rx.maxPriceMxnCents != null) {
    merged.maxPriceMxnCents = Math.min(merged.maxPriceMxnCents, rx.maxPriceMxnCents);
  }
  if (merged.minPriceMxnCents != null && rx.minPriceMxnCents != null) {
    merged.minPriceMxnCents = Math.max(merged.minPriceMxnCents, rx.minPriceMxnCents);
  }
  if (merged.maxPriceMxnCents == null) merged.maxPriceMxnCents = rx.maxPriceMxnCents;
  if (merged.minPriceMxnCents == null) merged.minPriceMxnCents = rx.minPriceMxnCents;

  const hint = embeddingContextSuffix(trimmed);
  if (hint) {
    merged.textForEmbedding = `${merged.textForEmbedding} ${hint}`.trim().slice(0, 2000);
  }

  return merged;
}

export function listingMatchesPriceFilters(
  priceMxn: number | null | undefined,
  f: Pick<ParsedQueryFilters, "maxPriceMxnCents" | "minPriceMxnCents">
): boolean {
  if (priceMxn == null || !Number.isFinite(Number(priceMxn))) return true;
  const p = Number(priceMxn);
  if (f.maxPriceMxnCents != null && p > f.maxPriceMxnCents) return false;
  if (f.minPriceMxnCents != null && p < f.minPriceMxnCents) return false;
  return true;
}
