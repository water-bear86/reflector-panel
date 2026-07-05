/* ── Fee-collection check interval ────────────────────────────────────
   Replaces the old fee-inflow-adaptive poller: the creator now picks a
   fixed cadence at creation time from a small set of tiers. Checking more
   often costs more real RPC budget (a Helius round-trip per pipeline per
   tick), so faster tiers carry a proportionally larger flat fee, charged
   once per successful distribute (not per check) — see PollIntervalTier
   below and its use in lib/pipelineExecutor.ts. */

export interface PollIntervalTier {
  minutes: number;
  feeLamports: number;
}

export const POLL_INTERVAL_TIERS: PollIntervalTier[] = [
  { minutes: 1, feeLamports: 10_000_000 }, // 0.0100 SOL per distribute
  { minutes: 2, feeLamports: 6_300_000 },  // 0.0063 SOL
  { minutes: 5, feeLamports: 4_000_000 },  // 0.0040 SOL
  { minutes: 10, feeLamports: 2_500_000 }, // 0.0025 SOL
  { minutes: 15, feeLamports: 1_600_000 }, // 0.0016 SOL
  { minutes: 30, feeLamports: 1_000_000 }, // 0.0010 SOL per distribute
];

export const DEFAULT_POLL_INTERVAL_MINUTES = 5;

export function isValidPollInterval(minutes: number): boolean {
  return POLL_INTERVAL_TIERS.some((t) => t.minutes === minutes);
}

export function feeLamportsForInterval(minutes: number): number {
  const tier = POLL_INTERVAL_TIERS.find((t) => t.minutes === minutes);
  if (tier) return tier.feeLamports;
  return POLL_INTERVAL_TIERS.find((t) => t.minutes === DEFAULT_POLL_INTERVAL_MINUTES)!.feeLamports;
}
