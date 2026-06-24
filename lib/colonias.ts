export interface ColoniaInfo {
  lat: number;
  lng: number;
  label: string;
  label_en: string;
  aliases: string[];
}

export const COLONIAS: Record<string, ColoniaInfo> = {
  centro:        { lat: 20.9146, lng: -100.7439, label: "Centro Histórico",       label_en: "Centro Histórico",       aliases: ["centro", "centro historico", "centro histórico", "jardín principal", "jardin principal"] },
  guadalupe:     { lat: 20.9168, lng: -100.7465, label: "Col. Guadalupe",          label_en: "Col. Guadalupe",          aliases: ["guadalupe", "colonia guadalupe"] },
  san_antonio:   { lat: 20.9120, lng: -100.7468, label: "San Antonio",             label_en: "San Antonio",             aliases: ["san antonio"] },
  aurora:        { lat: 20.9188, lng: -100.7442, label: "Col. Aurora",             label_en: "Col. Aurora",             aliases: ["aurora", "colonia aurora"] },
  olimpo:        { lat: 20.9158, lng: -100.7420, label: "El Olimpo",               label_en: "El Olimpo",               aliases: ["olimpo", "el olimpo"] },
  ojo_agua:      { lat: 20.9200, lng: -100.7480, label: "Ojo de Agua",             label_en: "Ojo de Agua",             aliases: ["ojo de agua"] },
  balcones:      { lat: 20.9080, lng: -100.7510, label: "Los Balcones",            label_en: "Los Balcones",            aliases: ["balcones", "los balcones"] },
  lindavista:    { lat: 20.9050, lng: -100.7490, label: "Linda Vista",             label_en: "Linda Vista",             aliases: ["lindavista", "linda vista"] },
  insurgentes:   { lat: 20.9130, lng: -100.7500, label: "Insurgentes",             label_en: "Insurgentes",             aliases: ["insurgentes"] },
  atascadero:    { lat: 20.9240, lng: -100.7430, label: "Atascadero",              label_en: "Atascadero",              aliases: ["atascadero"] },
  la_lejona:     { lat: 20.8980, lng: -100.7450, label: "La Lejona",               label_en: "La Lejona",               aliases: ["lejona", "la lejona"] },
  fracc_paloma:  { lat: 20.9100, lng: -100.7420, label: "Fracc. La Paloma",        label_en: "Fracc. La Paloma",        aliases: ["la paloma", "fracc la paloma", "fraccionamiento la paloma"] },
  pedregal:      { lat: 20.9060, lng: -100.7470, label: "Pedregal de Lindavista",  label_en: "Pedregal de Lindavista",  aliases: ["pedregal", "pedregal de lindavista"] },
  guadiana:      { lat: 20.9170, lng: -100.7500, label: "Guadiana",                label_en: "Guadiana",                aliases: ["guadiana"] },
  colinas_san_j: { lat: 20.9220, lng: -100.7510, label: "Colinas de San Javier",   label_en: "Colinas de San Javier",   aliases: ["colinas", "san javier", "colinas de san javier"] },
  la_canada:     { lat: 20.9000, lng: -100.7480, label: "La Cañada",               label_en: "La Cañada",               aliases: ["cañada", "la cañada", "canada", "la canada"] },
  otro:          { lat: 20.9153, lng: -100.7439, label: "San Miguel de Allende",   label_en: "San Miguel de Allende",   aliases: [] },
};

export const COLONIA_KEYS = Object.keys(COLONIAS).filter(k => k !== "otro");

/** Colonia chip order for hero search (alphabetical by display label). */
export function sortedColoniaKeys(lang: "es" | "en" = "es"): string[] {
  const locale = lang === "en" ? "en" : "es";
  return COLONIA_KEYS.slice().sort((a, b) =>
    coloniaLabel(a, lang).localeCompare(coloniaLabel(b, lang), locale, { sensitivity: "base" }),
  );
}

export const ALL_COLONIA_KEYS = Object.keys(COLONIAS);

export function coloniaLabel(key: string, lang: "es" | "en" = "es"): string {
  const c = COLONIAS[key];
  if (!c) return key;
  return lang === "en" ? c.label_en : c.label;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Detect a colonia name inside a free-text query.
 * Returns the colonia key and the query with the colonia name removed,
 * or null if no colonia was found.
 */
export function detectColoniaInQuery(query: string): { coloniaKey: string; cleanedQuery: string } | null {
  const norm = normalize(query);
  let bestMatch: { key: string; alias: string; len: number } | null = null;

  for (const [key, info] of Object.entries(COLONIAS)) {
    if (key === "otro") continue;
    for (const alias of info.aliases) {
      const normAlias = normalize(alias);
      if (norm.includes(normAlias) && (!bestMatch || normAlias.length > bestMatch.len)) {
        bestMatch = { key, alias: normAlias, len: normAlias.length };
      }
    }
  }

  if (!bestMatch) return null;

  const idx = norm.indexOf(bestMatch.alias);
  const cleaned = (query.slice(0, idx) + query.slice(idx + bestMatch.len))
    .replace(/\s*(en|in|de|del|la|el|los|las|por|,)\s*$/i, "")
    .replace(/^\s*(en|in|de|del|la|el|los|las|por|,)\s*/i, "")
    .trim();

  return { coloniaKey: bestMatch.key, cleanedQuery: cleaned };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Given a lat/lng, find the nearest colonia (excluding "otro").
 * Returns null if the nearest colonia is farther than maxKm.
 */
export function nearestColonia(lat: number, lng: number, maxKm = 3.0): { key: string; label: string; distKm: number } | null {
  let best: { key: string; label: string; distKm: number } | null = null;
  for (const [key, info] of Object.entries(COLONIAS)) {
    if (key === "otro") continue;
    const d = haversineKm(lat, lng, info.lat, info.lng);
    if (d <= maxKm && (!best || d < best.distKm)) {
      best = { key, label: info.label, distKm: Math.round(d * 10) / 10 };
    }
  }
  return best;
}

export const COLONIA_RADIUS_KM = 2.0;
