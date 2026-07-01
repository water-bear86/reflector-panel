import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { decryptKeypair } from "./crypto";
import { claimCreatorFees } from "./pumpClaim";
import { spendableClaimedRewardLamports } from "./rewardFunding";
import type { PipelineRecord, SplitRule } from "./pipelineStore";

const HELIUS_KEY = process.env.HELIUS_API_KEY || "";
const RPC_URL = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
// Jupiter's old quote-api.jup.ag/v6 host was retired (DNS no longer resolves — surfaced as
// "fetch failed"). Current free endpoint is lite-api.jup.ag/swap/v1 with the same quote/swap contract.
const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

// Canonical wrapped-SOL mint. When a pipeline's source is this, we're in "SOL mode":
// the thing being split is the wallet's native SOL (e.g. claimed Pump.fun creator rewards),
// not an SPL token account balance.
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

// Leave this much SOL untouched to cover transaction fees for the claim + every rule tx
// (swaps, distribute batches, sends). Without a float, the wallet couldn't pay for its own txs.
const SOL_RESERVE_LAMPORTS = 20_000_000; // 0.02 SOL

// Distribute only to the largest N holders. Every recipient needs an ATA-create (~0.002 SOL rent)
// + a transfer — sending to every holder of a popular token would blow the function timeout, the
// rent/fee budget, and the RPC rate limit. The reward pool is split proportionally among the top N.
const MAX_DISTRIBUTE_RECIPIENTS = 100;

export interface RuleResult {
  type: string;
  pct: number;
  [key: string]: unknown;
}

interface TokenHolder {
  address: string;
  balanceRaw: bigint;
  pct: number;
}

/* ── Turn any thrown value into a useful string. web3.js/SPL sometimes throw non-Error objects
   (e.g. SendTransactionError with a `.logs` array), which otherwise collapse to "unknown error". ── */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as any;
    const logs: string[] | undefined = anyErr.logs || anyErr.transactionLogs;
    const base = `${err.name}: ${err.message}`.trim();
    const withLogs = logs?.length ? `${base} | logs: ${logs.slice(-6).join(" ⏎ ")}` : base;
    return withLogs || "Error (no message)";
  }
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) || String(err);
  } catch {
    return String(err);
  }
}

/* ── Detect a mint's token program (legacy SPL vs Token-2022). Every SPL instruction we build
   (ATA derivation, transfer, burn) must target the mint's actual program or it fails with
   InvalidAccountData. ── */
async function getTokenProgramId(mint: PublicKey): Promise<PublicKey> {
  // Retry on a null/failed lookup and throw if we can't determine it — silently defaulting to the
  // legacy program on a transient RPC miss would build burn/transfer instructions for the wrong
  // program and fail every tx with InvalidAccountData.
  for (let attempt = 0; attempt < 3; attempt++) {
    const info = await connection.getAccountInfo(mint);
    if (info) {
      if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
      if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
      throw new Error(`${mint.toBase58().slice(0, 8)}… is not an SPL mint (owner ${info.owner.toBase58()})`);
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`Could not fetch mint ${mint.toBase58().slice(0, 8)}… to determine its token program`);
}

/* ── Current token balance of an ATA (0 if the account doesn't exist yet). ── */
async function ataBalance(ata: PublicKey, programId: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, ata, "confirmed", programId)).amount;
  } catch {
    return 0n;
  }
}

async function waitForAtaDelta(ata: PublicKey, programId: PublicKey, pre: bigint): Promise<bigint> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await ataBalance(ata, programId);
    const delta = current - pre;
    if (delta > 0n) return delta;
    await sleep(500 * (attempt + 1));
  }
  return (await ataBalance(ata, programId)) - pre;
}

async function getConfirmedOutputDelta(signature: string, owner: PublicKey, outputMint: string): Promise<bigint | null> {
  const ownerAddress = owner.toBase58();

  for (let attempt = 0; attempt < 8; attempt++) {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (tx?.meta) {
      const sumBalances = (balances: typeof tx.meta.preTokenBalances | typeof tx.meta.postTokenBalances) =>
        (balances || [])
          .filter((b) => b.mint === outputMint && b.owner === ownerAddress)
          .reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n);

      return sumBalances(tx.meta.postTokenBalances) - sumBalances(tx.meta.preTokenBalances);
    }

    await sleep(500 * (attempt + 1));
  }

  return null;
}

/* ── Jupiter swap — returns the raw (base-unit) output amount, still in the output mint's own decimals ── */
async function jupiterSwap(keypair: Keypair, inputMint: string, outputMint: string, amount: number) {
  const quoteUrl = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;
  const quoteRes = await fetch(quoteUrl);
  const quoteData = await quoteRes.json();
  if (!quoteData.outAmount) throw new Error(`No route: ${inputMint.slice(0, 8)} → ${outputMint.slice(0, 8)}`);

  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      // Jupiter v1 uses `maxLamports` (v6 called it `maxPriorityLamports`); the old key now 422s.
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" } },
    }),
  });
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) throw new Error(`No swap transaction returned${swapData.error ? `: ${swapData.error}` : ""}`);

  // Jupiter returns a v0 VersionedTransaction — legacy Transaction.from() can't parse it.
  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, "base64"));
  tx.sign([keypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    "confirmed"
  );
  const actualOutAmountRaw = await getConfirmedOutputDelta(sig, keypair.publicKey, outputMint);
  return { txid: sig, quotedOutAmountRaw: BigInt(quoteData.outAmount), actualOutAmountRaw };
}

/* ── Burn tokens — `amountRaw` is already in the mint's base units ── */
async function burnTokens(keypair: Keypair, mintPubkey: PublicKey, ata: PublicKey, amountRaw: bigint, programId: PublicKey) {
  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createBurnInstruction(ata, mintPubkey, keypair.publicKey, amountRaw, [], programId)),
    [keypair],
    { commitment: "confirmed" }
  );
  return { txid: sig };
}

/* ── Distribute to holders — `totalRawAmount` is the swap's raw output amount, already in `mint`'s base units.
   No decimal conversion here: mixing another mint's decimals into this math is exactly the bug being fixed. ── */
async function distributeTokens(
  keypair: Keypair,
  mintPubkey: PublicKey,
  sourceAta: PublicKey,
  programId: PublicKey,
  holders: TokenHolder[],
  totalRawAmount: bigint
) {
  const results: { address: string; amountRaw: string; txid: string }[] = [];
  const totalHolderBalance = holders.reduce((sum, h) => sum + h.balanceRaw, 0n);
  if (totalHolderBalance <= 0n) return results;

  const BATCH_SIZE = 5; // each transfer also carries an ATA-create instruction, so keep batches small
  for (let i = 0; i < holders.length; i += BATCH_SIZE) {
    const batch = holders.slice(i, i + BATCH_SIZE);
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));
    const included: { address: string; amountRaw: string }[] = [];

    for (const h of batch) {
      const amountRaw = (totalRawAmount * h.balanceRaw) / totalHolderBalance;
      if (amountRaw <= 0n) continue;
      const dest = new PublicKey(h.address);
      const destAta = await getAssociatedTokenAddress(mintPubkey, dest, false, programId);
      tx.add(createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destAta, dest, mintPubkey, programId));
      tx.add(createTransferInstruction(sourceAta, destAta, keypair.publicKey, amountRaw, [], programId));
      included.push({ address: h.address, amountRaw: amountRaw.toString() });
    }

    if (included.length) {
      const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed", skipPreflight: true });
      for (const h of included) results.push({ ...h, txid: sig });
    }
  }

  return results;
}

/* ── Send SPL tokens to a single wallet — creates the destination ATA if missing ── */
async function transferTokens(keypair: Keypair, mint: string, sourceAta: PublicKey, toWallet: string, amountRaw: number) {
  const mintPubkey = new PublicKey(mint);
  const programId = await getTokenProgramId(mintPubkey);
  const dest = new PublicKey(toWallet);
  const destAta = await getAssociatedTokenAddress(mintPubkey, dest, false, programId);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destAta, dest, mintPubkey, programId),
    createTransferInstruction(sourceAta, destAta, keypair.publicKey, amountRaw, [], programId)
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
  return { txid: sig };
}

/* ── Send native SOL to a single wallet (SOL-mode `send` rule) ── */
async function transferSol(keypair: Keypair, toWallet: string, lamports: number) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(toWallet), lamports })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
  return { txid: sig };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── Snapshot holders via Helius — with backoff so a transient rate-limit doesn't abort the run
   (aborting mid-distribute would strand already-swapped tokens in the wallet). ── */
function parseRawAmount(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? BigInt(Math.trunc(value)) : 0n;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

async function getTokenHoldersHelius(mint: string): Promise<{ owner: string; amount: string }[]> {
  if (!HELIUS_KEY) return [];
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  const MAX_RETRIES = 5;
  let allAccounts: { owner: string; amount: string }[] = [];
  let cursor: string | null = null;

  do {
    let data: any;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getTokenAccounts",
          params: { mint, limit: 1000, cursor, displayOptions: { showZeroBalance: false } },
        }),
      });
      const rateLimited = res.status === 429;
      data = rateLimited ? null : await res.json().catch(() => null);
      const errMsg: string | undefined = data?.error?.message;
      const transient = rateLimited || (errMsg && /rate limit|429|too many/i.test(errMsg));
      if (data && !data.error) break;
      if (transient && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`Helius error: ${errMsg ?? (rateLimited ? "rate limited" : "request failed")}`);
    }
    allAccounts.push(...(data.result?.token_accounts || []));
    cursor = data.result?.cursor;
  } while (cursor);

  return allAccounts;
}

async function getTokenHoldersFallback(mint: string): Promise<{ owner: string; amount: string }[]> {
  // Standard Solana RPC: getTokenLargestAccounts + getMultipleAccounts
  const rpc = connection;
  const largest = await rpc.getTokenLargestAccounts(new PublicKey(mint));
  if (!largest?.value?.length) return [];

  const accountAddresses = largest.value.map((a) => a.address.toBase58());
  const accountInfos = await rpc.getMultipleAccountsInfo(accountAddresses.map((a) => new PublicKey(a)));

  const accounts: { owner: string; amount: string }[] = [];
  for (let i = 0; i < largest.value.length; i++) {
    const info = accountInfos[i];
    if (!info) continue;
    // Parse the account data to find owner and amount
    try {
      // The token account data layout: 32 bytes mint + 32 bytes owner + 8 bytes amount (little-endian u64)
      const data = info.data;
      if (data.length < 72) continue;
      const ownerBytes = data.subarray(32, 64);
      const amountBytes = data.subarray(64, 72);
      const owner = new PublicKey(ownerBytes).toBase58();
      // Read u64 little-endian
      let amount = 0n;
      for (let j = 0; j < 8; j++) {
        amount |= BigInt(amountBytes[j]) << BigInt(j * 8);
      }
      accounts.push({ owner, amount: amount.toString() });
    } catch {
      continue;
    }
  }
  return accounts;
}

async function getTokenHolders(mint: string, excludeOwner?: PublicKey): Promise<TokenHolder[]> {
  // Prefer Helius for reliable pagination; fall back to standard Solana RPC.
  let rawAccounts: { owner: string; amount: string }[] = [];
  try {
    rawAccounts = await getTokenHoldersHelius(mint);
  } catch {
    // Helius unavailable or rate-limited — fall back to public RPC
  }
  if (!rawAccounts.length) {
    rawAccounts = await getTokenHoldersFallback(mint);
  }

  // Only distribute to real wallets. Off-curve owners are pools / program vaults / bonding-curve
  // accounts — they throw TokenOwnerOffCurveError on ATA derivation and shouldn't be rewarded anyway.
  const excluded = excludeOwner?.toBase58();
  const eligible = rawAccounts.flatMap((h) => {
    const balanceRaw = parseRawAmount(h.amount);
    if (balanceRaw <= 0n || h.owner === "11111111111111111111111111111111" || h.owner === excluded) return [];
    try {
      if (!PublicKey.isOnCurve(new PublicKey(h.owner).toBytes())) return [];
    } catch {
      return [];
    }
    return [{ owner: h.owner, balanceRaw }];
  });
  // Take the largest N holders, then split the pool proportionally among just those.
  const topHolders = eligible
    .sort((a, b) => (a.balanceRaw === b.balanceRaw ? 0 : a.balanceRaw > b.balanceRaw ? -1 : 1))
    .slice(0, MAX_DISTRIBUTE_RECIPIENTS);
  const total = topHolders.reduce((sum, h) => sum + h.balanceRaw, 0n);
  return topHolders.map((h) => ({
    address: h.owner,
    balanceRaw: h.balanceRaw,
    pct: total > 0n ? Number((h.balanceRaw * 1_000_000n) / total) / 10_000 : 0,
  }));
}

async function executeRule(
  keypair: Keypair,
  sourceMint: string,
  sourceAta: PublicKey | null,
  ruleAmountRaw: number,
  rule: SplitRule,
  isSol: boolean
): Promise<RuleResult> {
  switch (rule.type) {
    case "burn": {
      // Native SOL can't be burned — there's no SPL token account behind it. Skip safely.
      if (isSol) return { type: "burn", pct: rule.pct, skipped: true, note: "cannot burn native SOL" };
      const mintPk = new PublicKey(sourceMint);
      const programId = await getTokenProgramId(mintPk);
      const ata = await getAssociatedTokenAddress(mintPk, keypair.publicKey, false, programId);
      const { txid } = await burnTokens(keypair, mintPk, ata, BigInt(ruleAmountRaw), programId);
      return { type: "burn", pct: rule.pct, amountRaw: ruleAmountRaw, txid };
    }

    case "buy-burn": {
      if (!rule.targetMint) throw new Error("buy-burn requires targetMint");
      const mintPk = new PublicKey(rule.targetMint);
      const programId = await getTokenProgramId(mintPk);
      const ata = await getAssociatedTokenAddress(mintPk, keypair.publicKey, false, programId);
      // Burn what we ACTUALLY receive (post − pre balance), not the quote — slippage means the
      // filled amount can be less than quoted, and burning more than we hold fails the whole tx.
      const pre = await ataBalance(ata, programId);
      const swapResult = await jupiterSwap(keypair, sourceMint, rule.targetMint, ruleAmountRaw);
      const received = swapResult.actualOutAmountRaw ?? await waitForAtaDelta(ata, programId, pre);
      if (received <= 0n) {
        return { type: "buy-burn", pct: rule.pct, swappedRaw: ruleAmountRaw, burnedRaw: 0, swapTxid: swapResult.txid, note: "nothing received to burn" };
      }
      const burnResult = await burnTokens(keypair, mintPk, ata, received, programId);
      return {
        type: "buy-burn", pct: rule.pct,
        swappedRaw: ruleAmountRaw, burnedRaw: received.toString(),
        swapTxid: swapResult.txid, burnTxid: burnResult.txid,
      };
    }

    case "distribute": {
      if (!rule.targetMint) throw new Error("distribute requires targetMint");
      if (!rule.holderMint) throw new Error("distribute requires holderMint");
      const mintPk = new PublicKey(rule.targetMint);
      const programId = await getTokenProgramId(mintPk);
      const srcAta = await getAssociatedTokenAddress(mintPk, keypair.publicKey, false, programId);
      const pre = await ataBalance(srcAta, programId);
      const swapResult = await jupiterSwap(keypair, sourceMint, rule.targetMint, ruleAmountRaw);
      const received = swapResult.actualOutAmountRaw ?? await waitForAtaDelta(srcAta, programId, pre);

      const holders = await getTokenHolders(rule.holderMint, keypair.publicKey);
      const distResults = received > 0n ? await distributeTokens(keypair, mintPk, srcAta, programId, holders, received) : [];

      return {
        type: "distribute", pct: rule.pct,
        swappedRaw: ruleAmountRaw, receivedRaw: received.toString(),
        swapTxid: swapResult.txid, totalHolders: holders.length, distributed: distResults.length,
        distributions: distResults.slice(0, 20),
      };
    }

    case "send": {
      if (!rule.targetWallet) throw new Error("send requires targetWallet");
      // SOL mode: send native SOL directly. SPL mode: send the source token.
      if (isSol) {
        const { txid } = await transferSol(keypair, rule.targetWallet, ruleAmountRaw);
        return { type: "send", pct: rule.pct, lamports: ruleAmountRaw, destination: rule.targetWallet.slice(0, 8) + "…", txid };
      }
      if (!rule.targetMint) throw new Error("send requires targetMint");
      if (!sourceAta) throw new Error("send requires a source token account");
      const { txid } = await transferTokens(keypair, rule.targetMint, sourceAta, rule.targetWallet, ruleAmountRaw);
      return { type: "send", pct: rule.pct, amountRaw: ruleAmountRaw, destination: rule.targetWallet.slice(0, 8) + "…", txid };
    }

    default:
      throw new Error(`Unknown rule type: ${(rule as SplitRule).type}`);
  }
}

export async function runPipeline(record: PipelineRecord): Promise<{ ok: boolean; results: RuleResult[]; error?: string; summary?: string }> {
  const results: RuleResult[] = [];

  try {
    const secret = decryptKeypair(record.encryptedKeypair).trim();
    const keypair = Keypair.fromSecretKey(
      secret.startsWith("[") ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret)
    );

    const isSol = record.sourceMint === WSOL_MINT;
    let claimedLamports = 0;

    // Step 0: claim Pump.fun creator fees (SOL). SOL-mode pipelines are allowed to spend only
    // the net SOL increase from this claim, never existing wallet SOL.
    if (record.claimCreatorFees) {
      const claim = await claimCreatorFees(connection, keypair);
      claimedLamports = claim.claimedLamports ?? 0;
      if (claim.claimed) results.push({ type: "claim", pct: 0, txid: claim.txid, claimedLamports });
      else if (claim.error) {
        results.push({ type: "claim", pct: 0, skipped: true, error: claim.error });
        if (isSol) return { ok: false, results, error: `creator fee claim failed: ${claim.error}` };
      }
    }

    let sourceBalance = 0;
    let sourceAta: PublicKey | null = null;
    let lamports = 0;

    if (isSol) {
      // SOL mode: spend only rewards claimed in this run, minus a reserve left from those same
      // rewards for swap/burn/distribution fees. Existing wallet SOL is never part of the split.
      lamports = await connection.getBalance(keypair.publicKey);
      sourceBalance = record.claimCreatorFees
        ? spendableClaimedRewardLamports(claimedLamports, lamports, SOL_RESERVE_LAMPORTS)
        : 0;
    } else {
      // SPL mode: the amount to split is the source token's ATA balance. Derive the ATA with the
      // mint's ACTUAL token program (legacy vs Token-2022) — defaulting to the legacy program here
      // derives the wrong ATA for a Token-2022 source, so getAccount misses and the whole run
      // silently no-ops (no swaps, reported as "success"). This is the same program-detection the
      // rules already do; the source read was the one place still hard-wired to legacy.
      const sourceMintPubkey = new PublicKey(record.sourceMint);
      const programId = await getTokenProgramId(sourceMintPubkey);
      sourceAta = await getAssociatedTokenAddress(sourceMintPubkey, keypair.publicKey, false, programId);
      try {
        const accountInfo = await getAccount(connection, sourceAta, "confirmed", programId);
        sourceBalance = Number(accountInfo.amount);
      } catch {
        // No reward-token account yet — not an error, but say so instead of a bare "success" so a
        // stuck pipeline reports a reason the owner can actually see.
        return { ok: true, results, summary: "no source-token account on the wallet yet — nothing to split" };
      }
    }

    if (sourceBalance <= 0) {
      // The run happened but there was nothing to swap. Spell out WHY — an empty "success" is
      // exactly what makes "swaps don't happen, I think" impossible to diagnose.
      const summary =
        isSol && lamports > 0
          ? record.claimCreatorFees
            ? `claimed ${(claimedLamports / 1e9).toFixed(6)} SOL this run, but wallet must keep at least ${(SOL_RESERVE_LAMPORTS / 1e9).toFixed(3)} SOL for fees — existing wallet SOL untouched`
            : "SOL source pipelines require reward claiming; existing wallet SOL is not spendable by the reward-only funding guard"
          : isSol
            ? "wallet SOL balance is 0 — nothing claimed to split yet"
            : "source-token balance is 0 — nothing to split yet";
      return { ok: true, results, summary };
    }

    const failures: string[] = [];
    for (let i = 0; i < record.rules.length; i++) {
      const rule = record.rules[i];
      const ruleAmountRaw = Math.floor(sourceBalance * (rule.pct / 100));
      if (ruleAmountRaw <= 0) continue;
      try {
        const result = await executeRule(keypair, record.sourceMint, sourceAta, ruleAmountRaw, rule, isSol);
        results.push(result);
      } catch (err: unknown) {
        // Record the exact failure per-rule and keep going, so one run surfaces every problem
        // rather than aborting on the first and hiding the rest.
        const detail = describeError(err);
        results.push({ type: rule.type, pct: rule.pct, error: detail });
        failures.push(`rule ${i + 1} (${rule.type}): ${detail}`);
      }
    }

    if (failures.length) return { ok: false, results, error: failures.join(" | ") };
    return { ok: true, results };
  } catch (err: unknown) {
    return { ok: false, results, error: describeError(err) };
  }
}
