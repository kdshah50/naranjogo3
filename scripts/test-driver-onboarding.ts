/**
 * Unit tests for driver onboarding validators (Phase 1).
 * Run: npm run test:driver-onboarding
 */
import {
  isValidLicenseNumber,
  isValidVehiclePlates,
  isValidVehicleYear,
  normalizePlates,
  sanitizeServiceColonias,
  validateDriverSignup,
} from "../lib/rides/driver-validators";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

// Plates
assert(normalizePlates(" abc-12-d ") === "ABC12D", "normalizePlates strips spaces/dashes");
assert(isValidVehiclePlates("GTO1234"), "valid plates GTO1234");
assert(isValidVehiclePlates("ABC12D"), "valid plates ABC12D");
assert(!isValidVehiclePlates("AB"), "reject short plates");
assert(!isValidVehiclePlates("ABCD123456789"), "reject long plates");

// License
assert(isValidLicenseNumber("GTO-12345678"), "valid license with dash");
assert(!isValidLicenseNumber("12"), "reject short license");

// Year
const now = new Date("2026-05-20T12:00:00.000Z");
assert(isValidVehicleYear(2020, now), "valid year 2020");
assert(isValidVehicleYear(2027, now), "valid next year");
assert(!isValidVehicleYear(1980, now), "reject too old");
assert(!isValidVehicleYear(2030, now), "reject too far future");

// Colonias
const zones = sanitizeServiceColonias(["centro", "guadalupe"], "centro");
assert(zones.includes("centro") && zones.includes("guadalupe"), "sanitize colonias");

// Full payload validation
const base = {
  name: "Test Driver",
  whatsapp: "+524151112233",
  license_number: "LIC123456",
  license_expiry: "2027-12-31",
  license_photo_url: "user/license.jpg",
  vehicle_make: "Nissan",
  vehicle_model: "March",
  vehicle_year: 2022,
  vehicle_color: "Blanco",
  vehicle_plates: "GTO1234",
  vehicle_card_photo_url: "user/card.jpg",
  insurance_provider: "GNP",
  insurance_policy: "POL-999",
  insurance_expiry: "2027-06-30",
  insurance_photo_url: "user/insurance.jpg",
  colonia: "centro",
  accepted_terms: true,
  accepted_pricing: true,
};

const good = validateDriverSignup(base);
assert(good.ok === true, "valid signup passes");

const badPlates = validateDriverSignup({ ...base, vehicle_plates: "X" });
assert(badPlates.ok === false, "invalid plates rejected");

const badExpiry = validateDriverSignup({ ...base, license_expiry: "2020-01-01" });
assert(badExpiry.ok === false, "expired license rejected");

const noTerms = validateDriverSignup({ ...base, accepted_terms: false });
assert(noTerms.ok === false, "terms required");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll driver onboarding validator tests passed.");
