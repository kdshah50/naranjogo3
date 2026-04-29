/**
 * Bilingual query → Spanish title tokens for sparse (ILIKE) search.
 * Marketplace is Mexico-first: listings use Spanish titles; users may type English or Spanish.
 */

const TRADE_HINTS: { re: RegExp; terms: string[] }[] = [
  {
    re: /\b(sink|faucet|faucets|drain|drains|piping|pipes?|plumb|plumbing|leak|leaks|clog|wc\b|toilet|water\s+heater|boiler|cañerías?|grifo|desagüe|fregadero|lavabo|excusado|escusado|taza|fuga|tapón|atasco|tapado|drenaje|tuberías?|tinaco|cisterna|calentador|hidráulic[oa]?)\b/i,
    terms: ["plomería", "plomero", "fontanero", "fontanería", "tuberías", "hidráulico", "desagüe", "grifo"],
  },
  {
    re: /\b(wiring|wire|wires|outlet|outlets|breaker|breakers|electric(al)?|lighting|fixture|short\s+circuit|tablero|cableado|corto\s+circuito|focos?|l[áa]mparas?|apagadores?|contactos?|interruptores?|voltaje)\b/i,
    terms: ["electricista", "eléctrico", "instalaciones eléctricas", "cableado"],
  },
  {
    re: /\b(tooth|teeth|dental|dentist|cavity|caries|orthodont|braces|muelas?|diente|odontólogo)\b/i,
    terms: ["dentista", "odontólogo", "dental", "odontología"],
  },
  {
    re: /\b(paint|painting|wallpaper|drywall|yeso|pintura|pintar)\b/i,
    terms: ["pintor", "pintura", "yeso"],
  },
  {
    re: /\b(clean(ing)?|housekeep|maid|limpieza|limpiar|aseo)\b/i,
    terms: ["limpieza", "aseo", "servicio doméstico"],
  },
  {
    re: /\b(babysit|nanny|childcare|niñer|guardería|niños|niñas|cuidado infantil)\b/i,
    terms: ["niñera", "cuidado", "infantil", "bebé"],
  },
  {
    re: /\b(garden|lawn|mow|yard|tree trim|paisaj|jardín|pasto|césped)\b/i,
    terms: ["jardinero", "jardín", "paisajismo", "podado"],
  },
  {
    re: /\b(locksmith|\block\b|\blocks\b|cerrajer|llaves?\s+(perdid|copias))\b/i,
    terms: ["cerrajero", "cerrajería", "llaves"],
  },
  {
    re: /\b(hvac|minisplit|air\s+condition|aire\s+acondicionado|calefacción|\bac\b)\b/i,
    terms: ["climatización", "aire acondicionado", "refrigeración", "minisplit"],
  },
  {
    re: /\b(carpentr|cabinet|woodwork|carpinter|muebles?|clóset)\b/i,
    terms: ["carpintero", "carpintería", "madera"],
  },
  {
    re: /\b(dog|dogs|puppy|puppies|cat|cats|pet\b|pets?|animal|walk(er|ers|ing)?\s+dog|dog\s+walk(er|ers|ing)?|petsit|pet-?sit|paseador|paseadores|paseo\s+(de\s+)?perros?|cuidado\s+de\s+mascotas)\b/i,
    terms: ["paseador", "perros", "mascotas", "cuidado de mascotas", "paseo de mascotas"],
  },
];

/** Noise words when tokenizing user query for OR title search (EN + ES). */
const QUERY_NOISE_WORDS =
  /^(need|want|fix|help|looking|for|the|and|with|my|near|a|an|necesito|necesita|quiero|busco|algun|alguna|algo|por|para|con|del|de|la|las|los|un|una|unos|me|mi|mis|muy|más|este|esta|eso|hoy|ya|arreglar|reparar|instalar|cambiar)$/i;

function normalizeToken(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

function splitPhrase(s: string): string[] {
  return s
    .split(/[\s,;/]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

/**
 * Single-word fragments excluded from ILIKE OR — otherwise `%de%`, `%la%`, `%me%`,
 * `%near%` match unrelated Spanish titles (“de” matches almost everything).
 */
const SPARSE_FRAGMENT_STOPWORDS = new Set(
  [
    "de",
    "del",
    "la",
    "las",
    "los",
    "el",
    "lo",
    "al",
    "y",
    "en",
    "un",
    "una",
    "unos",
    "unas",
    "con",
    "por",
    "para",
    "sin",
    "sobre",
    "entre",
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "near",
    "not",
    "but",
    "are",
    "you",
    "all",
    "can",
    "let",
    "get",
    "has",
    "was",
    "how",
    "who",
    "why",
    "me",
    "mi",
    "tu",
    "su",
    "te",
    "se",
    "le",
    "nos",
    "os",
    "my",
    "our",
    "your",
  ].map((s) => normalizeToken(s))
);

/**
 * Tokens for sparse title matching: user + keyword fragments plus inferred Spanish trade terms.
 */
export function sparseSearchTokens(userQuery: string, keywordPhrase: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2) return;
    const key = normalizeToken(t);
    if (SPARSE_FRAGMENT_STOPWORDS.has(key)) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  const blob = `${userQuery}\n${keywordPhrase}`;
  for (const { re, terms } of TRADE_HINTS) {
    if (re.test(blob)) {
      for (const term of terms) add(term);
    }
  }

  for (const part of splitPhrase(keywordPhrase)) {
    if (part.length >= 2) add(part);
  }
  for (const part of splitPhrase(userQuery)) {
    if (part.length >= 3 && !QUERY_NOISE_WORDS.test(part)) {
      add(part);
    }
  }

  return out.slice(0, 10);
}

/** Short line appended to embedding text when trade hints match (helps vector search stay on-trade). */
export function embeddingContextSuffix(userQuery: string): string {
  for (const { re, terms } of TRADE_HINTS) {
    if (re.test(userQuery)) {
      return `Mercado México, anuncios en español; rubros: ${terms.slice(0, 6).join(", ")}.`;
    }
  }
  return "";
}
