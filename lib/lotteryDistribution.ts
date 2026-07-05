export const EXISTING_ATA_RECIPIENT_COST_LAMPORTS = 20_000;
export const MISSING_ATA_RECIPIENT_COST_LAMPORTS = 2_120_000;
export const MIN_SWAP_LAMPORTS = 2_100_000;
// 245 is the max a 0.5 SOL pool (the default drop threshold) can fund at worst-case
// per-recipient rent cost — see moneyGate.ts MIN_SOL_DROP_LAMPORTS.
export const MAX_LOTTERY_RECIPIENTS = 245;

// Holder-reach modes for "distribute" rules — a per-rule cap on how many lottery-selected
// holders share the swapped amount. Fewer recipients means a bigger equal-split payout each
// (the split is always equal, never balance-weighted — see allocateEqualRawAmounts below).
export type HolderMode = "bless" | "here" | "spam";
export const HOLDER_MODE_MAX_RECIPIENTS: Record<HolderMode, number> = {
  bless: 10,
  here: Math.floor(MAX_LOTTERY_RECIPIENTS * 0.5),
  spam: MAX_LOTTERY_RECIPIENTS,
};
export function isHolderMode(v: unknown): v is HolderMode {
  return v === "bless" || v === "here" || v === "spam";
}

// Each mode's cap above was calibrated for a rule pool the size of exactly its share of the
// platform drop threshold (poolLamports == dropThresholdLamports * pct/100). When the actual
// pool is bigger than that — fees piled up over several cycles, or a bigger creator than usual —
// scale the cap up by the same ratio, so the surplus reaches more holders instead of just
// making the same capped audience's equal-split payout bigger. Never scales down: a smaller
// pool still gets planLotteryDistribution's own budget math to decide who's affordable.
export function scaleMaxRecipientsForSurplus(input: {
  baseCap: number;
  poolLamports: number;
  dropThresholdLamports: number;
  pct: number;
}): number {
  const baselinePoolForRule = input.dropThresholdLamports * (input.pct / 100);
  if (baselinePoolForRule <= 0) return input.baseCap;
  const surplusRatio = input.poolLamports / baselinePoolForRule;
  if (surplusRatio <= 1) return input.baseCap;
  return Math.floor(input.baseCap * surplusRatio);
}

export interface LotteryCandidate {
  address: string;
  balanceRaw: bigint;
  hasTargetAta: boolean;
}

export interface LotteryRecipient extends LotteryCandidate {
  lotteryRank: number;
  estimatedCostLamports: number;
}

export interface LotteryDistributionPlan {
  seed: string;
  recipients: LotteryRecipient[];
  ataExistingCount: number;
  ataMissingCount: number;
  estimatedCostLamports: number;
  rentBudgetLamports: number;
  swapLamports: number;
  skippedForBudget: number;
}

export interface EqualAllocationRecipient {
  address: string;
  lotteryRank: number;
}

export interface EqualRawAllocation {
  address: string;
  amountRaw: bigint;
}

export function planLotteryDistribution(input: {
  candidates: LotteryCandidate[];
  poolLamports: number;
  seed: string;
  maxRecipients?: number;
  minSwapLamports?: number;
}): LotteryDistributionPlan | null {
  const maxRecipients = input.maxRecipients ?? MAX_LOTTERY_RECIPIENTS;
  const minSwapLamports = input.minSwapLamports ?? MIN_SWAP_LAMPORTS;
  if (!Number.isFinite(input.poolLamports) || input.poolLamports <= minSwapLamports) return null;

  // Fully random draw order every round — NOT grouped by ATA cost first. Grouping by cost meant
  // that whenever the "already holds the target token" pool was smaller than the recipient cap,
  // every single one of them won every round regardless of shuffle rank (nobody in a group
  // smaller than the cap can ever be excluded by an internal reshuffle), which looked like the
  // lottery wasn't random at all. Cost still exists as a tiebreak on an exact rank collision
  // (astronomically unlikely with a 64-bit hash), never as a primary sort key.
  const shuffled = stableShuffle(input.candidates, input.seed)
    .map((candidate, index) => ({ ...candidate, lotteryRank: index + 1 }))
    .sort((a, b) => {
      if (a.lotteryRank !== b.lotteryRank) return a.lotteryRank - b.lotteryRank;
      return a.hasTargetAta ? -1 : 1;
    });

  let budget = Math.floor(input.poolLamports - minSwapLamports);
  const recipients: LotteryRecipient[] = [];
  let skippedForBudget = 0;

  for (const candidate of shuffled) {
    if (recipients.length >= maxRecipients) {
      skippedForBudget += 1;
      continue;
    }
    const estimatedCostLamports = candidate.hasTargetAta
      ? EXISTING_ATA_RECIPIENT_COST_LAMPORTS
      : MISSING_ATA_RECIPIENT_COST_LAMPORTS;
    if (estimatedCostLamports > budget) {
      skippedForBudget += 1;
      continue;
    }
    budget -= estimatedCostLamports;
    recipients.push({ ...candidate, estimatedCostLamports });
  }

  if (!recipients.length) return null;

  const estimatedCostLamports = recipients.reduce(
    (sum, recipient) => sum + recipient.estimatedCostLamports,
    0
  );
  const rentBudgetLamports = recipients
    .filter((recipient) => !recipient.hasTargetAta)
    .length * MISSING_ATA_RECIPIENT_COST_LAMPORTS;

  return {
    seed: input.seed,
    recipients,
    ataExistingCount: recipients.filter((recipient) => recipient.hasTargetAta).length,
    ataMissingCount: recipients.filter((recipient) => !recipient.hasTargetAta).length,
    estimatedCostLamports,
    rentBudgetLamports,
    swapLamports: Math.max(minSwapLamports, Math.floor(input.poolLamports - estimatedCostLamports)),
    skippedForBudget,
  };
}

export function allocateEqualRawAmounts(input: {
  recipients: EqualAllocationRecipient[];
  totalRawAmount: bigint;
}): EqualRawAllocation[] {
  if (input.totalRawAmount <= 0n) return [];
  const ranked = [...input.recipients].sort((a, b) => a.lotteryRank - b.lotteryRank);
  const recipients = input.totalRawAmount < BigInt(ranked.length)
    ? ranked.slice(0, Number(input.totalRawAmount))
    : ranked;
  if (!recipients.length) return [];

  const base = input.totalRawAmount / BigInt(recipients.length);
  const dust = Number(input.totalRawAmount % BigInt(recipients.length));

  return recipients.map((recipient, index) => ({
    address: recipient.address,
    amountRaw: base + (index < dust ? 1n : 0n),
  }));
}

function stableShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, index) => ({ item, key: fnv1a64(`${seed}:${index}`) }))
    .sort((a, b) => {
      if (a.key === b.key) return 0;
      return a.key < b.key ? -1 : 1;
    })
    .map(({ item }) => item);
}

function fnv1a64(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}
