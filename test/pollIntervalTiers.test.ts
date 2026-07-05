import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POLL_INTERVAL_MINUTES,
  feeLamportsForInterval,
  isValidPollInterval,
  POLL_INTERVAL_TIERS,
} from "../lib/pollIntervalTiers.ts";

test("every tier's interval is valid", () => {
  for (const tier of POLL_INTERVAL_TIERS) {
    assert.equal(isValidPollInterval(tier.minutes), true);
  }
});

test("isValidPollInterval rejects a value outside the fixed set", () => {
  assert.equal(isValidPollInterval(7), false);
});

test("feeLamportsForInterval strictly decreases as the interval grows", () => {
  const sorted = [...POLL_INTERVAL_TIERS].sort((a, b) => a.minutes - b.minutes);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      feeLamportsForInterval(sorted[i].minutes) < feeLamportsForInterval(sorted[i - 1].minutes),
      `fee at ${sorted[i].minutes}min should be less than at ${sorted[i - 1].minutes}min`
    );
  }
});

test("feeLamportsForInterval falls back to the default tier's fee for an invalid interval", () => {
  assert.equal(feeLamportsForInterval(7), feeLamportsForInterval(DEFAULT_POLL_INTERVAL_MINUTES));
});
