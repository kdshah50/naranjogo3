/**
 * Unit tests for serialized ride status codes and transition rules (R-SEQ).
 * Run: npm run test:ride-status-rules
 */
import {
  RIDE_STATUS_CODE,
  canAdvanceStatusCode,
  rideCodeToStatus,
  rideStatusCodeRank,
  rideStatusToCode,
} from "../lib/rides/ride-status-codes";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

assert(rideStatusToCode("requested") === 10, "requested = 10");
assert(rideStatusToCode("matched") === 20, "matched = 20");
assert(rideStatusToCode("accepted") === 30, "accepted = 30");
assert(rideStatusToCode("arrived") === 40, "arrived = 40");
assert(rideStatusToCode("in_trip") === 50, "in_trip = 50");
assert(rideStatusToCode("completed") === 60, "completed = 60");

assert(rideCodeToStatus(40) === "arrived", "40 → arrived");
assert(rideCodeToStatus(99) === null, "unknown code → null");

const happyPath = [
  RIDE_STATUS_CODE.requested,
  RIDE_STATUS_CODE.matched,
  RIDE_STATUS_CODE.accepted,
  RIDE_STATUS_CODE.arrived,
  RIDE_STATUS_CODE.in_trip,
  RIDE_STATUS_CODE.completed,
] as const;

for (let i = 1; i < happyPath.length; i++) {
  const from = happyPath[i - 1];
  const to = happyPath[i];
  assert(canAdvanceStatusCode(from, to), `R-SEQ: ${from} → ${to}`);
}

assert(!canAdvanceStatusCode(60, 50), "R-SEQ blocks downgrade 60→50");
assert(!canAdvanceStatusCode(40, 40), "R-SEQ blocks same code 40→40");
assert(canAdvanceStatusCode(10, 60), "R-SEQ allows forward jump (skip guard is ride-lifecycle)");

assert(canAdvanceStatusCode(30, RIDE_STATUS_CODE.cancelled), "cancel allowed from matched+");
assert(!canAdvanceStatusCode(10, RIDE_STATUS_CODE.cancelled), "cancel blocked before match");

assert(rideStatusCodeRank(60) > rideStatusCodeRank(40), "rank monotonic 40 < 60");
assert(rideStatusCodeRank(RIDE_STATUS_CODE.cancelled) === -1, "cancelled rank -1");

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll ride status rule tests passed.");
