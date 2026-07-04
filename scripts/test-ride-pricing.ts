/**
 * Unit tests for ride pricing + WhatsApp intent parser (Phase 3).
 * Run: npm run test:ride-pricing
 */
import { COLONIAS } from "../lib/colonias";
import { estimateFare, estimateQuickIndividualFare, resolveRideFareEstimate, haversineMeters, surgeMultiplierForWhen } from "../lib/rides/ride-pricing";
import { fareOptionsForDropoffKey, quickIndividualFarePerStopCents } from "../lib/rides/ride-destinations";
import { parseRideIntentFromText } from "../lib/rides/whatsapp-inbound";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

const centro = COLONIAS.centro;
const guadalupe = COLONIAS.guadalupe;

const est = estimateFare(
  { lat: centro.lat, lng: centro.lng, address: "Centro" },
  { lat: guadalupe.lat, lng: guadalupe.lng, address: "Guadalupe" }
);

assert(est.distance_m > 0, "distance_m positive");
assert(est.estimated_total_mxn_cents >= 10000, "min fare enforced");
assert(est.hold_amount_mxn_cents >= est.estimated_total_mxn_cents, "hold >= estimate");

const airportEst = estimateFare(
  { lat: centro.lat, lng: centro.lng, address: "Centro" },
  { lat: 20.6173, lng: -100.1856, address: "QRO" },
  new Date(),
  fareOptionsForDropoffKey("airport_queretaro"),
);
assert(airportEst.used_fixed_price, "airport destination always uses reference fare");
assert(airportEst.estimated_total_mxn_cents === 180000, "QRO reference fare applied");

const atotonilcoEst = estimateFare(
  { lat: centro.lat, lng: centro.lng, address: "Centro" },
  { lat: 20.9297, lng: -100.7447, address: "Atotonilco" },
  new Date(),
  fareOptionsForDropoffKey("centro_atotonilco"),
);
assert(
  atotonilcoEst.estimated_total_mxn_cents >= 25000,
  "Atotonilco reference fare wins when higher than distance calc",
);

const quickThree = estimateQuickIndividualFare(3, {
  pickup: { lat: centro.lat, lng: centro.lng, address: "Centro" },
  stops: [
    { lat: guadalupe.lat, lng: guadalupe.lng, address: "Guadalupe" },
    { lat: COLONIAS.aurora.lat, lng: COLONIAS.aurora.lng, address: "Aurora" },
    { lat: COLONIAS.san_antonio.lat, lng: COLONIAS.san_antonio.lng, address: "San Antonio" },
  ],
});
assert(quickThree.quick_individual_stops === 3, "quick individual stop count");
assert(
  quickThree.estimated_total_mxn_cents === quickIndividualFarePerStopCents() * 3,
  "3 quick individual destinations = $240 MXN",
);
assert(quickThree.estimated_total_mxn_cents === 24000, "3 × $80 MXN");

const dist = haversineMeters(centro.lat, centro.lng, guadalupe.lat, guadalupe.lng);
assert(dist === est.distance_m, "haversine matches estimate distance");

assert(surgeMultiplierForWhen(new Date("2026-05-22T02:00:00Z")) >= 1, "surge multiplier sane");

const parsed = parseRideIntentFromText("taxi de centro a guadalupe");
assert(parsed?.pickupColoniaKey === "centro", "parse de X a Y pickup");
assert(parsed?.dropoffColoniaKey === "guadalupe", "parse de X a Y dropoff");

const parsed2 = parseRideIntentFromText("necesito taxi centro guadalupe");
assert(parsed2?.pickupColoniaKey === "centro", "parse two colonias");

assert(parseRideIntentFromText("hola") === null, "reject gibberish");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll ride pricing tests passed.");
