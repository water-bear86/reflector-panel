import { getSupabase } from "./supabase";
import type { EncryptedKeypair } from "./crypto";

export type RuleType = "burn" | "buy-burn" | "distribute" | "send";
export type HolderMode = "bless" | "here" | "spam";

export interface SplitRule {
  type: RuleType;
  pct: number;
  targetMint: string;
  targetWallet: string;
  holderMint: string;
  // "distribute" only — how many lottery-selected holders share the payout. Undefined on
  // legacy rows predating this field; treat as "spam" (max reach, the prior fixed behavior).
  holderMode?: HolderMode;
}

export interface PipelineRecord {
  id: string;
  createdAt: string;
  ownerAddress: string | null;
  sourceMint: string;
  sourceWallet: string;
  network: "mainnet";
  rules: SplitRule[];
  intervalMinutes: number;
  enabled: boolean;
  claimCreatorFees: boolean;
  // The token mint whose Pump.fun creator fees this pipeline collects (via the
  // fee-sharing distribute crank). The pipeline's own wallet must be the mint's
  // sole fee receiver. null on legacy rows that predate fee sharing.
  feeMint: string | null;
  // Spendable SOL (after the fee-float reserve) required before a distribution round fires.
  // null means "use the platform default" (see moneyGate.ts MIN_SOL_DROP_LAMPORTS).
  dropThresholdLamports: number | null;
  encryptedKeypair: EncryptedKeypair;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunSummary: string | null;
  lastRunResults?: unknown[];
  // Lamports collected by the fee-sharing crank on the LAST completed poll — informational
  // only (surfaced in run summaries). null until the first successful poll.
  lastClaimedLamports: number | null;
}

/* ── DB row uses snake_case; app code uses camelCase — convert at the boundary ── */

interface PipelineRow {
  id: string;
  created_at: string;
  owner_address: string | null;
  source_mint: string;
  source_wallet: string;
  network: "mainnet";
  rules: SplitRule[];
  interval_minutes: number;
  enabled: boolean;
  claim_creator_fees: boolean;
  fee_mint: string | null;
  drop_threshold_lamports: number | null;
  encrypted_keypair: EncryptedKeypair;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_summary: string | null;
  last_run_results: unknown[] | null;
  last_claimed_lamports: number | null;
}

function fromRow(row: PipelineRow): PipelineRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    ownerAddress: row.owner_address,
    sourceMint: row.source_mint,
    sourceWallet: row.source_wallet,
    network: row.network,
    rules: row.rules,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled,
    claimCreatorFees: row.claim_creator_fees,
    feeMint: row.fee_mint,
    dropThresholdLamports: row.drop_threshold_lamports,
    encryptedKeypair: row.encrypted_keypair,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunSummary: row.last_run_summary,
    lastRunResults: row.last_run_results ?? undefined,
    lastClaimedLamports: row.last_claimed_lamports ?? null,
  };
}

export async function createPipeline(input: {
  ownerAddress: string | null;
  sourceMint: string;
  sourceWallet: string;
  rules: SplitRule[];
  intervalMinutes: number;
  claimCreatorFees: boolean;
  feeMint?: string | null;
  dropThresholdLamports?: number | null;
  encryptedKeypair: EncryptedKeypair;
  enabled?: boolean;
}): Promise<PipelineRecord> {
  const { data, error } = await getSupabase()
    .from("pipelines")
    .insert({
      owner_address: input.ownerAddress,
      source_mint: input.sourceMint,
      source_wallet: input.sourceWallet,
      network: "mainnet",
      rules: input.rules,
      interval_minutes: input.intervalMinutes,
      enabled: input.enabled ?? true,
      claim_creator_fees: input.claimCreatorFees,
      fee_mint: input.feeMint ?? null,
      drop_threshold_lamports: input.dropThresholdLamports ?? null,
      encrypted_keypair: input.encryptedKeypair,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create pipeline: ${error.message}`);
  return fromRow(data as PipelineRow);
}

export async function updateDropThreshold(id: string, dropThresholdLamports: number | null): Promise<void> {
  const { error } = await getSupabase()
    .from("pipelines")
    .update({ drop_threshold_lamports: dropThresholdLamports })
    .eq("id", id);

  if (error) throw new Error(`Failed to update drop threshold for pipeline ${id}: ${error.message}`);
}

export async function listEnabledPipelines(): Promise<PipelineRecord[]> {
  const { data, error } = await getSupabase().from("pipelines").select("*").eq("enabled", true);
  if (error) throw new Error(`Failed to list pipelines: ${error.message}`);
  return (data as PipelineRow[]).map(fromRow);
}

export async function getPipeline(id: string): Promise<PipelineRecord | null> {
  const { data, error } = await getSupabase().from("pipelines").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to fetch pipeline ${id}: ${error.message}`);
  return data ? fromRow(data as PipelineRow) : null;
}

export async function setPipelineEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await getSupabase().from("pipelines").update({ enabled }).eq("id", id);
  if (error) throw new Error(`Failed to set enabled=${enabled} for pipeline ${id}: ${error.message}`);
}

export async function claimDuePipelineRun(record: PipelineRecord, now: number): Promise<boolean> {
  let query = getSupabase()
    .from("pipelines")
    .update({
      last_run_at: new Date(now).toISOString(),
      last_run_summary: "running",
    })
    .eq("id", record.id)
    .eq("enabled", true)
    .select("id");

  query = record.lastRunAt ? query.eq("last_run_at", record.lastRunAt) : query.is("last_run_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to claim pipeline ${record.id}: ${error.message}`);
  return (data || []).length === 1;
}

export async function recordRun(
  id: string,
  update: {
    status: "success" | "error";
    summary: string;
    results?: unknown[];
    outLamports?: number;
    claimedLamports?: number;
    airdropWallets?: number;
    airdropNewWallets?: number;
    airdropRuns?: number;
    airdropLamports?: number;
  }
): Promise<void> {
  const row: Record<string, unknown> = {
    last_run_at: new Date().toISOString(),
    last_run_status: update.status,
    last_run_summary: update.summary,
    last_run_results: update.results ?? null,
  };

  // Accumulate lifetime totals for REAL payouts only. Everything here is gated on money actually
  // leaving the wallet toward holders — a claim-only or no-op run (fees collected but below
  // threshold, nothing to split, etc.) leaves all of these untouched, so the top bar never
  // reports a claim as a payout/airdrop. Cron runs are serialized per pipeline
  // (claimDuePipelineRun locks the row), so read-modify-write is safe.
  const hasPayout = !!(update.outLamports && update.outLamports > 0);
  const hasAirdrop = !!(update.airdropWallets && update.airdropWallets > 0);
  const hasClaim = !!(update.claimedLamports && update.claimedLamports > 0);
  if (hasPayout || hasAirdrop || hasClaim) {
    const { data } = await getSupabase()
      .from("pipelines")
      .select("total_out_lamports, total_airdrop_wallets, total_airdrop_runs, total_airdrop_lamports, total_claimed_lamports")
      .eq("id", id)
      .maybeSingle();
    const prev = (data as any) || {};
    if (hasPayout) {
      // "SOL sent out" is intentionally kept EQUAL to "fees claimed" (mirrored in the hasClaim
      // block) — the pipeline distributes 100% of what it collects, so the two are the same number.
      // Here we only stamp the payout time.
      row.last_payout_at = row.last_run_at;
    }
    if (hasAirdrop) {
      // "wallets paid" counts DISTINCT first-time payees only (airdropNewWallets), so it tracks
      // real reach and plateaus at the holder base instead of summing repeat holders every drop.
      row.total_airdrop_wallets = Number(prev.total_airdrop_wallets ?? 0) + Math.floor(update.airdropNewWallets ?? 0);
      row.total_airdrop_runs = Number(prev.total_airdrop_runs ?? 0) + Math.floor(update.airdropRuns ?? 0);
      row.total_airdrop_lamports = Number(prev.total_airdrop_lamports ?? 0) + Math.floor(update.airdropLamports ?? 0);
    }
    // Cumulative creator fees collected — the "keep up with new claims" number. Accrues on EVERY
    // run that collects fees, even one below the drop threshold. SOL sent out mirrors this exactly.
    if (hasClaim) {
      const newClaimed = Number(prev.total_claimed_lamports ?? 0) + Math.floor(update.claimedLamports!);
      row.total_claimed_lamports = newClaimed;
      row.total_out_lamports = newClaimed; // keep "SOL sent out" == "fees claimed"
    }
  }

  // 0 is a meaningful poll result (fees genuinely dried up) — must persist it, not just truthy values.
  if (update.claimedLamports !== undefined) row.last_claimed_lamports = Math.floor(update.claimedLamports);

  const { error } = await getSupabase().from("pipelines").update(row).eq("id", id);
  if (error) throw new Error(`Failed to record run for pipeline ${id}: ${error.message}`);
}

export function isDue(record: PipelineRecord, now: number): boolean {
  if (!record.lastRunAt) return true;
  const dueAt = new Date(record.lastRunAt).getTime() + record.intervalMinutes * 60_000;
  return now >= dueAt;
}
