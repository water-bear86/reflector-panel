import { PublicKey } from "@solana/web3.js";
import type { SplitRule } from "./pipelineStore";
import { isHolderMode } from "./lotteryDistribution";
import { DEFAULT_POLL_INTERVAL_KEY, isPollIntervalKey, minutesForPollIntervalKey } from "./pollInterval";
import type { PollIntervalKey } from "./pollInterval";

/* ── Shared pipeline-input validation ────────────────────────────────
   Used by both /api/deploy (creates the pipeline) and /api/validate (dry
   run, no side effects) so the two never drift out of sync. */

export function isValidPubkey(s: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export interface ValidatedPipelineInput {
  mint: string;
  cleanRules: SplitRule[];
  dropThresholdLamports: number | null;
  pollIntervalKey: PollIntervalKey;
  pollIntervalMinutes: number;
}

export type ValidationResult =
  | { ok: true; value: ValidatedPipelineInput }
  | { ok: false; error: string };

export function validatePipelineInput(body: {
  feeMint?: string;
  rules?: SplitRule[];
  dropThresholdSol?: number | string | null;
  pollIntervalKey?: string | null;
}): ValidationResult {
  const mint = (body.feeMint || "").trim();
  if (!mint) return { ok: false, error: "feeMint required — the token whose creator fees this pipeline collects" };
  if (!isValidPubkey(mint)) return { ok: false, error: "feeMint is not a valid Solana address" };
  if (!Array.isArray(body.rules) || !body.rules.length) return { ok: false, error: "rules required" };

  const cleanRules = body.rules
    .filter((r) => r.pct > 0)
    .map((r) => ({
      type: r.type,
      pct: r.pct,
      targetMint: (r.targetMint || "").trim(),
      targetWallet: (r.targetWallet || "").trim(),
      holderMint: (r.holderMint || "").trim(),
      // Normalize now so a stored rule always carries an explicit mode — "spam" (max reach)
      // matches the fixed behavior this field replaces, so anything unset defaults to it.
      holderMode: r.type === "distribute" ? (isHolderMode(r.holderMode) ? r.holderMode : "spam") : undefined,
    }));
  if (!cleanRules.length) return { ok: false, error: "at least one rule with pct > 0 is required" };
  const totalPct = cleanRules.reduce((s, r) => s + r.pct, 0);
  if (totalPct !== 100) return { ok: false, error: `rules must total 100% (got ${totalPct}%)` };

  // Each rule needs its type-specific target fields, or it would deploy and then fail on
  // the first run ("distribute requires targetMint"). Validate up front, including that
  // the referenced mints/wallets are real Solana addresses.
  for (let i = 0; i < cleanRules.length; i++) {
    const r = cleanRules[i];
    const need = (field: string, val: string): string | null => {
      if (!val) return `rule ${i + 1} (${r.type}) requires ${field}`;
      if (!isValidPubkey(val)) return `rule ${i + 1} (${r.type}): ${field} is not a valid Solana address`;
      return null;
    };
    let err: string | null = null;
    if (r.type === "distribute") err = need("holderMint", r.holderMint) || need("targetMint", r.targetMint);
    else if (r.type === "buy-burn") err = need("targetMint", r.targetMint);
    else if (r.type === "send") err = need("targetWallet", r.targetWallet);
    if (err) return { ok: false, error: err };
  }

  let dropThresholdLamports: number | null = null;
  if (body.dropThresholdSol !== undefined && body.dropThresholdSol !== null && body.dropThresholdSol !== ("" as unknown)) {
    const parsed = Number(body.dropThresholdSol);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: "dropThresholdSol must be a non-negative number" };
    }
    dropThresholdLamports = Math.round(parsed * 1e9);
  }

  const pollIntervalKey = isPollIntervalKey(body.pollIntervalKey) ? body.pollIntervalKey : DEFAULT_POLL_INTERVAL_KEY;

  return {
    ok: true,
    value: {
      mint,
      cleanRules,
      dropThresholdLamports,
      pollIntervalKey,
      pollIntervalMinutes: minutesForPollIntervalKey(pollIntervalKey),
    },
  };
}
