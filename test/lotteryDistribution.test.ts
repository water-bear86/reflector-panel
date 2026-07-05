import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEqualRawAmounts,
  MISSING_ATA_RECIPIENT_COST_LAMPORTS,
  planLotteryDistribution,
  scaleMaxRecipientsForSurplus,
} from "../lib/lotteryDistribution.ts";

test("planLotteryDistribution is deterministic for the same seed", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    address: `holder-${index}`,
    balanceRaw: BigInt(index + 1),
    hasTargetAta: index % 2 === 0,
  }));

  const first = planLotteryDistribution({
    candidates,
    poolLamports: 100_000_000,
    seed: "same-seed",
  });
  const second = planLotteryDistribution({
    candidates,
    poolLamports: 100_000_000,
    seed: "same-seed",
  });

  assert.deepEqual(
    first?.recipients.map((recipient) => recipient.address),
    second?.recipients.map((recipient) => recipient.address)
  );
});

test("planLotteryDistribution prioritizes existing token accounts to maximize holder count", () => {
  const candidates = [
    ...Array.from({ length: 3 }, (_, index) => ({
      address: `missing-${index}`,
      balanceRaw: 1n,
      hasTargetAta: false,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      address: `existing-${index}`,
      balanceRaw: 1n,
      hasTargetAta: true,
    })),
  ];

  const plan = planLotteryDistribution({
    candidates,
    poolLamports: 3_000_000,
    seed: "prefer-existing",
  });

  assert.ok(plan);
  assert.equal(plan.recipients.length, 10);
  assert.equal(plan.ataExistingCount, 10);
  assert.equal(plan.ataMissingCount, 0);
});

test("planLotteryDistribution does not always include every existing-ATA holder over an equal-count missing-ATA one when the cap forces scarcity", () => {
  // 8 existing-ATA + 8 missing-ATA candidates, cap of 8 — small enough that cost-class-first
  // ordering would previously guarantee all 8 existing-ATA holders win every single round
  // (they're always sorted ahead of the missing-ATA group, and 8 fits the cap exactly).
  // A big enough pool that a handful of missing-ATA picks are affordable too.
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => ({ address: `existing-${index}`, balanceRaw: 1n, hasTargetAta: true })),
    ...Array.from({ length: 8 }, (_, index) => ({ address: `missing-${index}`, balanceRaw: 1n, hasTargetAta: false })),
  ];

  const recipientSets = Array.from({ length: 25 }, (_, i) =>
    planLotteryDistribution({
      candidates,
      poolLamports: 20_000_000,
      seed: `randomness-check-${i}`,
      maxRecipients: 8,
    })
  ).map((plan) => plan?.recipients.map((r) => r.address).sort().join(","));

  // If cost class still gated who's even considered, every one of these would be identical
  // (all 8 existing-ATA holders, every time). Real randomness means the winning set varies.
  const distinctSets = new Set(recipientSets);
  assert.ok(distinctSets.size > 1, "expected the winning set to vary across seeds, not stay fixed");

  // And at least one round should include a missing-ATA holder — proving cost class no longer
  // unconditionally excludes the more expensive group whenever there's room to afford it.
  const anyRoundIncludesMissing = recipientSets.some((set) => set?.includes("missing-"));
  assert.ok(anyRoundIncludesMissing, "expected at least one round to include a missing-ATA holder");
});

test("planLotteryDistribution uses remaining budget for missing token accounts", () => {
  const candidates = Array.from({ length: 500 }, (_, index) => ({
    address: `holder-${index}`,
    balanceRaw: 1n,
    hasTargetAta: false,
  }));

  const plan = planLotteryDistribution({
    candidates,
    poolLamports: 500_000_000,
    seed: "missing-ata-budget",
  });

  assert.ok(plan);
  assert.equal(plan.recipients.length, Math.floor((500_000_000 - 2_100_000) / MISSING_ATA_RECIPIENT_COST_LAMPORTS));
});

test("allocateEqualRawAmounts gives each selected recipient the same amount and assigns dust by lottery rank", () => {
  const allocations = allocateEqualRawAmounts({
    recipients: [
      { address: "third", lotteryRank: 3 },
      { address: "first", lotteryRank: 1 },
      { address: "second", lotteryRank: 2 },
    ],
    totalRawAmount: 10n,
  });

  assert.deepEqual(allocations, [
    { address: "first", amountRaw: 4n },
    { address: "second", amountRaw: 3n },
    { address: "third", amountRaw: 3n },
  ]);
});

test("allocateEqualRawAmounts trims recipients that cannot receive at least one raw unit", () => {
  const allocations = allocateEqualRawAmounts({
    recipients: [
      { address: "a", lotteryRank: 1 },
      { address: "b", lotteryRank: 2 },
      { address: "c", lotteryRank: 3 },
    ],
    totalRawAmount: 2n,
  });

  assert.deepEqual(allocations, [
    { address: "a", amountRaw: 1n },
    { address: "b", amountRaw: 1n },
  ]);
});

test("scaleMaxRecipientsForSurplus leaves the cap alone at or below the calibrated pool size", () => {
  assert.equal(
    scaleMaxRecipientsForSurplus({ baseCap: 245, poolLamports: 500_000_000, dropThresholdLamports: 500_000_000, pct: 100 }),
    245
  );
  assert.equal(
    scaleMaxRecipientsForSurplus({ baseCap: 245, poolLamports: 250_000_000, dropThresholdLamports: 500_000_000, pct: 100 }),
    245
  );
});

test("scaleMaxRecipientsForSurplus scales the cap up proportionally to surplus over the rule's threshold share", () => {
  // 2 SOL pool vs a 0.5 SOL threshold at 100% pct is 4x the calibration point.
  assert.equal(
    scaleMaxRecipientsForSurplus({ baseCap: 245, poolLamports: 2_000_000_000, dropThresholdLamports: 500_000_000, pct: 100 }),
    980
  );
  // Same 4x surplus, but this rule is only 50% of the pool split, so its own calibration
  // baseline is half the platform threshold.
  assert.equal(
    scaleMaxRecipientsForSurplus({ baseCap: 245, poolLamports: 1_000_000_000, dropThresholdLamports: 500_000_000, pct: 50 }),
    980
  );
});
