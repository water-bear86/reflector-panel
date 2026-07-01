/* ── Platform fee ─────────────────────────────────────────────────────
   1.5% of each run's pool, taken off the top BEFORE the split rules run
   (rules operate on the remaining 98.5%). Disclosed in the docs. In SOL
   mode this is a native transfer; in SPL mode it's a token transfer of
   the source mint. */

export const PLATFORM_FEE_BPS = 150; // 1.5%
export const PLATFORM_FEE_WALLET = "CaGErhKB8LzdBz9rxPpKppFKVKKERhpeRLuBYchsAM7t";

// Below this, the network fee for collecting costs more than the fee itself — skip charging.
export const MIN_FEE_LAMPORTS = 50_000; // 0.00005 SOL

export function computePlatformFee(poolRaw: number): number {
  if (!Number.isFinite(poolRaw) || poolRaw <= 0) return 0;
  return Math.floor((poolRaw * PLATFORM_FEE_BPS) / 10_000);
}
