import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POLL_INTERVAL_KEY,
  isPollIntervalKey,
  minutesForPollIntervalKey,
  POLL_INTERVAL_PRESETS,
} from "../lib/pollInterval.ts";

test("every preset's key round-trips through isPollIntervalKey", () => {
  for (const preset of POLL_INTERVAL_PRESETS) {
    assert.equal(isPollIntervalKey(preset.key), true);
  }
});

test("isPollIntervalKey rejects an unknown key", () => {
  assert.equal(isPollIntervalKey("fastest"), false);
  assert.equal(isPollIntervalKey(undefined), false);
});

test("the default key is one of the three presets", () => {
  assert.equal(isPollIntervalKey(DEFAULT_POLL_INTERVAL_KEY), true);
});

test("minutesForPollIntervalKey resolves each preset's own minutes", () => {
  for (const preset of POLL_INTERVAL_PRESETS) {
    assert.equal(minutesForPollIntervalKey(preset.key), preset.minutes);
  }
});
