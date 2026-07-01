import { getSupabase } from "./supabase";
import type { EncryptedKeypair } from "./crypto";

export type RuleType = "burn" | "buy-burn" | "distribute" | "send";

export interface SplitRule {
  type: RuleType;
  pct: number;
  targetMint: string;
  targetWallet: string;
  holderMint: string;
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
  encryptedKeypair: EncryptedKeypair;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunSummary: string | null;
  lastRunResults?: unknown[];
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
  encrypted_keypair: EncryptedKeypair;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_summary: string | null;
  last_run_results: unknown[] | null;
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
    encryptedKeypair: row.encrypted_keypair,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lastRunSummary: row.last_run_summary,
    lastRunResults: row.last_run_results ?? undefined,
  };
}

export async function createPipeline(input: {
  ownerAddress: string | null;
  sourceMint: string;
  sourceWallet: string;
  rules: SplitRule[];
  intervalMinutes: number;
  claimCreatorFees: boolean;
  encryptedKeypair: EncryptedKeypair;
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
      enabled: true,
      claim_creator_fees: input.claimCreatorFees,
      encrypted_keypair: input.encryptedKeypair,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create pipeline: ${error.message}`);
  return fromRow(data as PipelineRow);
}

export async function listEnabledPipelines(): Promise<PipelineRecord[]> {
  const { data, error } = await getSupabase().from("pipelines").select("*").eq("enabled", true);
  if (error) throw new Error(`Failed to list pipelines: ${error.message}`);
  return (data as PipelineRow[]).map(fromRow);
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
  update: { status: "success" | "error"; summary: string; results?: unknown[] }
): Promise<void> {
  const { error } = await getSupabase()
    .from("pipelines")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: update.status,
      last_run_summary: update.summary,
      last_run_results: update.results ?? null,
    })
    .eq("id", id);

  if (error) throw new Error(`Failed to record run for pipeline ${id}: ${error.message}`);
}

export function isDue(record: PipelineRecord, now: number): boolean {
  if (!record.lastRunAt) return true;
  const dueAt = new Date(record.lastRunAt).getTime() + record.intervalMinutes * 60_000;
  return now >= dueAt;
}
