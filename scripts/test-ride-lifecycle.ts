/**
 * Unit tests for ride lifecycle transitions (Phase 4).
 * Run: npm run test:ride-lifecycle
 */
import {
  canTransitionRideStatus,
  cancelFeeApplies,
  computeCommissionMxnCents,
  driverPayoutMxnCents,
  RIDE_CANCEL_FREE_MS,
} from "../lib/rides/ride-lifecycle";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

assert(canTransitionRideStatus("matched", "accepted"), "matched → accepted");
assert(canTransitionRideStatus("arrived", "in_trip"), "arrived → in_trip");
assert(!canTransitionRideStatus("completed", "in_trip"), "no downgrade from completed");
assert(canTransitionRideStatus("completed", "disputed"), "completed → disputed");
assert(!canTransitionRideStatus("requested", "completed"), "no skip to completed");

assert(computeCommissionMxnCents(14500) === 1450, "10% commission on 145 MXN");
assert(driverPayoutMxnCents(14500) === 13050, "driver net after commission");

const matchedAt = new Date(Date.now() - RIDE_CANCEL_FREE_MS - 1000).toISOString();
assert(cancelFeeApplies(matchedAt), "cancel fee after free window");
assert(!cancelFeeApplies(new Date().toISOString()), "free cancel right after match");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll ride lifecycle tests passed.");
