/* ── Bucketed distribution sizing ─────────────────────────────────────
   The number of holders who receive a drop scales with the size of the
   claimed-fee pool. Rationale: every NEW recipient costs ~0.002 SOL in
   ATA rent (paid by the pipeline wallet), so a tiny claim spread across
   100 wallets would burn more in rent than it delivers. Scaling keeps
   rent a small, fixed fraction of the drop:

     0.015 SOL pool → top 1 holder
     0.10 SOL pool → top 6
     0.50 SOL pool → top 33
     1.00 SOL pool → top 66
     3.00+ SOL pool → top 200 (cap)

   The rent budget for those recipients is carved out of the pool BEFORE
   the swap, so distribution can always pay for its own account creation. */

// Worst-case cost to create one recipient token account (rent-exempt minimum + tx-fee margin).
export const ATA_COST_LAMPORTS = 2_100_000; // ~0.0021 SOL

// One recipient per this much pool value — the "bucket ratio" (cap of 200 is reached at 3 SOL).
export const LAMPORTS_PER_RECIPIENT = 15_000_000; // 0.015 SOL

export const MAX_RECIPIENTS = 200;

export interface DistributionPlan {
  recipients: number; // how many top holders receive this drop
  rentBudgetLamports: number; // kept as SOL to fund worst-case ATA rent for those recipients
  swapLamports: number; // what actually gets swapped into the reward token
}

export function planDistribution(poolLamports: number): DistributionPlan | null {
  if (!Number.isFinite(poolLamports) || poolLamports <= 0) return null;

  const recipients = Math.max(1, Math.min(MAX_RECIPIENTS, Math.floor(poolLamports / LAMPORTS_PER_RECIPIENT)));
  const rentBudgetLamports = recipients * ATA_COST_LAMPORTS;
  const swapLamports = poolLamports - rentBudgetLamports;

  // Pool so small it can't cover even one recipient's rent plus a meaningful swap.
  if (swapLamports < ATA_COST_LAMPORTS) return null;

  return { recipients, rentBudgetLamports, swapLamports };
}
