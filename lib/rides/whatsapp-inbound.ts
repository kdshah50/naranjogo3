import { COLONIAS, coloniaLabel, detectColoniaInQuery } from "@/lib/colonias";
import { locationFromColoniaKey } from "@/lib/rides/ride-locations";

export type ParsedRideIntent = {
  pickupColoniaKey: string;
  dropoffColoniaKey: string;
  pickupAddress: string;
  dropoffAddress: string;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Parse simple Spanish ride requests for Twilio sandbox testing.
 * Examples:
 *   "taxi de centro a guadalupe"
 *   "necesito taxi centro guadalupe"
 *   "viaje de san antonio a aurora"
 */
export function parseRideIntentFromText(raw: string): ParsedRideIntent | null {
  let text = String(raw ?? "").trim();
  if (!text) return null;

  text = text.replace(/^(hola|buenas|hey|oi)\b[,.]?\s*/i, "");
  text = text.replace(/\b(necesito|quiero|pido|un|una|el|la|por favor|pls)\b/gi, " ");
  text = text.replace(/\b(taxi|viaje|ride|uber|naranjogo|naranjo)\b/gi, " ");
  text = text.replace(/\s+/g, " ").trim();

  const deA = text.match(/\bde\s+(.+?)\s+a\s+(.+)$/i);
  if (deA) {
    const pickupPart = deA[1].trim();
    const dropoffPart = deA[2].trim();
    const pickupHit = detectColoniaInQuery(pickupPart);
    const dropHit = detectColoniaInQuery(dropoffPart);
    if (pickupHit && dropHit && pickupHit.coloniaKey !== dropHit.coloniaKey) {
      return {
        pickupColoniaKey: pickupHit.coloniaKey,
        dropoffColoniaKey: dropHit.coloniaKey,
        pickupAddress: pickupHit.cleanedQuery || coloniaLabel(pickupHit.coloniaKey, "es"),
        dropoffAddress: dropHit.cleanedQuery || coloniaLabel(dropHit.coloniaKey, "es"),
      };
    }
  }

  const hits: Array<{ key: string; index: number }> = [];
  const norm = normalizeText(text);
  for (const [key, info] of Object.entries(COLONIAS)) {
    if (key === "otro") continue;
    for (const alias of [key, ...info.aliases]) {
      const normAlias = normalizeText(alias);
      const idx = norm.indexOf(normAlias);
      if (idx >= 0) {
        hits.push({ key, index: idx });
        break;
      }
    }
  }

  hits.sort((a, b) => a.index - b.index);
  const unique = [...new Map(hits.map((h) => [h.key, h])).values()];
  if (unique.length >= 2) {
    return {
      pickupColoniaKey: unique[0].key,
      dropoffColoniaKey: unique[1].key,
      pickupAddress: coloniaLabel(unique[0].key, "es"),
      dropoffAddress: coloniaLabel(unique[1].key, "es"),
    };
  }

  return null;
}

export function buildRideIntentLocations(intent: ParsedRideIntent) {
  const pickup = locationFromColoniaKey(intent.pickupColoniaKey, intent.pickupAddress);
  const dropoff = locationFromColoniaKey(intent.dropoffColoniaKey, intent.dropoffAddress);
  if (!pickup || !dropoff) return null;
  return { pickup, dropoff };
}

export const RIDE_WHATSAPP_HELP_ES =
  "Para pedir un taxi escribe: *taxi de [origen] a [destino]*\nEjemplo: taxi de centro a guadalupe\n\nTambién puedes usar: /viaje en la app NaranjoGo.";
