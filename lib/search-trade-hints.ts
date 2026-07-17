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
    re: /\b(cook(ing)?|chef|chefs|kitchen|meal\s*prep|cater(ing)?|culinar|food\s+prep|cocin(a|er[oa]?|ando)?|comida|recetas?|banquetes?)\b/i,
    terms: ["chef", "cocinero", "cocinera", "cocina", "comida", "servicio de cocina"],
  },
  {
    re: /\b(clean(ing)?|housekeep(ing|er)?|maid|limpieza|limpiar|aseo|deep\s+clean|limpieza\s+profunda|mudanza|move-?out|lavado\s+de\s+ropa|lavander[ií]a|planchado|ironing|sanitize|desinfecc|house\s+clean)\b/i,
    terms: [
      "limpieza",
      "limpieza del hogar",
      "aseo",
      "servicio doméstico",
      "limpieza profunda",
      "empleada doméstica",
    ],
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
    re: /\b(veterinar(y|ia|io|ios|ias)|\bvet\b|vets|pet\s+hospital|cl[ií]nica\s+veterin|servicios?\s+veterin|vacun(a|cion|aci[oó]n)|desparasit|antirr[aá]bica|rabies\s+vaccine|spay|neuter|esteriliz|castrac|rayos?\s*x|radiograf[ií]|ultrasonido|ultrasound|limpieza\s+dental|extracci[oó]n\s+dental|eutanasia|cremaci[oó]n|hospitalizaci[oó]n|chequeo\s+anual|wellness\s+exam|ex[oó]tico?s?\s+(animal|pet)|microchip\s+pet|consulta\s+veterin)\b/i,
    terms: [
      "veterinaria",
      "veterinario",
      "clínica veterinaria",
      "servicios veterinarios",
      "consulta veterinaria",
      "vacunas",
      "vacunación",
      "desparasitación",
      "antirrábica",
    ],
  },
  {
    re: /\b(dog|dogs|puppy|puppies|cat|cats|pet\b|pets?|animal|walk(er|ers|ing)?\s+dog|dog\s+walk(er|ers|ing)?|petsit|pet-?sit|pet\s+sitting|groom(er|ing)?|grooming|est[eé]tica\s+canina|paseador|paseadores|paseo\s+(de\s+)?perros?|cuidado\s+de\s+mascotas|hospedaje\s+mascotas?|boarding\s+pet)\b/i,
    terms: [
      "paseador",
      "pet sitting",
      "estética canina",
      "perros",
      "mascotas",
      "cuidado de mascotas",
      "paseo de mascotas",
    ],
  },
  {
    re: /\b(taxi|cabs?\b|uber|didi|lyft|ride[\s-]?hail(ing)?|ride\s+share|rideshare|transporte|transport|chauffeur|chofer|private\s+driver|airport\s+(run|transfer|shuttle)|aeropuerto|QRO\b|quer[eé]taro|GTO\b|guanajuato|le[oó]n\b|CDMX|m[eé]xico\s+city|ciudad\s+de\s+m[eé]xico|from\s+.+\s+to|de\s+.+\s+a|sma\b|san\s+miguel)\b/i,
    terms: [
      "taxi",
      "Transporte / Taxi",
      "transporte",
      "transporte por aplicación",
      "ride-hailing",
      "chofer",
    ],
  },
  {
    re: /\b(property\s+manag|administraci[oó]n\s+de\s+propiedad|administrador(a)?\s+de\s+(propiedad|condomin)|hoa\b|condo\s+manag|rental\s+manag|gesti[oó]n\s+de\s+renta|key\s+holding|custodia\s+de\s+llaves|absentee\s+owner|casa\s+vac[ií]a|retainer)\b/i,
    terms: [
      "administración de propiedades",
      "administrador de propiedades",
      "gestión de rentas",
      "custodia de llaves",
      "property management",
    ],
  },
];

const TAXI_INTENT_RE =
  /\b(taxi|cabs?\b|uber|didi|lyft|ride[\s-]?hail(ing)?|ride\s+share|rideshare|transporte|transport|chauffeur|chofer|private\s+driver|airport\s+(run|transfer|shuttle)|aeropuerto|QRO\b|quer[eé]taro|GTO\b|guanajuato|le[oó]n\b|CDMX|m[eé]xico\s+city|ciudad\s+de\s+m[eé]xico|from\s+.+\s+to|de\s+.+\s+a)\b/i;

/** True when the user is looking for taxi / ride-hailing, not generic services. */
export function isTaxiTransportSearchQuery(userQuery: string, keywordPhrase = ""): boolean {
  return TAXI_INTENT_RE.test(`${userQuery}\n${keywordPhrase}`);
}

/** Keep hybrid results on taxi listings when the query is ride-related. */
export function listingMatchesTaxiTransportIntent(listing: {
  title_es?: string | null;
  subcategory_kind?: string | null;
}): boolean {
  const kind = String(listing.subcategory_kind ?? "").trim().toLowerCase();
  if (kind === "ride") return true;
  const title = String(listing.title_es ?? "").trim().toLowerCase();
  return /\b(taxi|transporte\s*\/?\s*taxi|ride\s*\/?\s*taxi|chofer|transporte\s+por\s+aplicaci|ride-hailing|uber)\b/i.test(
    title,
  );
}

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
  // Tokenize keyword phrase only — full user query may still contain stripped price text ("under $600").

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
