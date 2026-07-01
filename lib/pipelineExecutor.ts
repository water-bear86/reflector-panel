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
} from "@solana/spl-token";
import bs58 from "bs58";
import { decryptKeypair } from "./crypto";
import { claimCreatorFees } from "./pumpClaim";
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

export interface RuleResult {
  type: string;
  pct: number;
  [key: string]: unknown;
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
  return { txid: sig, outAmountRaw: Number(quoteData.outAmount) };
}

/* ── Burn tokens — `amountRaw` is already in the mint's base units ── */
async function burnTokens(keypair: Keypair, mint: string, amountRaw: number) {
  const mintPubkey = new PublicKey(mint);
  const ata = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createBurnInstruction(ata, mintPubkey, keypair.publicKey, amountRaw)),
    [keypair],
    { commitment: "confirmed" }
  );
  return { txid: sig, burnedRaw: amountRaw };
}

/* ── Distribute to holders — `totalRawAmount` is the swap's raw output amount, already in `mint`'s base units.
   No decimal conversion here: mixing another mint's decimals into this math is exactly the bug being fixed. ── */
async function distributeTokens(
  keypair: Keypair,
  mint: string,
  holders: { address: string; pct: number }[],
  totalRawAmount: number
) {
  const mintPubkey = new PublicKey(mint);
  const sourceAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
  const results: { address: string; amountRaw: number; txid: string }[] = [];

  const BATCH_SIZE = 5; // lower than before since each transfer now also carries an ATA-create instruction
  for (let i = 0; i < holders.length; i += BATCH_SIZE) {
    const batch = holders.slice(i, i + BATCH_SIZE);
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));

    for (const h of batch) {
      const amountRaw = Math.floor(totalRawAmount * (h.pct / 100));
      if (amountRaw <= 0) continue;
      const dest = new PublicKey(h.address);
      const destAta = await getAssociatedTokenAddress(mintPubkey, dest);
      tx.add(createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destAta, dest, mintPubkey));
      tx.add(createTransferInstruction(sourceAta, destAta, keypair.publicKey, amountRaw));
    }

    if (tx.instructions.length > 1) {
      const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed", skipPreflight: true });
      for (const h of batch) {
        results.push({ address: h.address, amountRaw: Math.floor(totalRawAmount * (h.pct / 100)), txid: sig });
      }
    }
  }

  return results;
}

/* ── Send SPL tokens to a single wallet — creates the destination ATA if missing ── */
async function transferTokens(keypair: Keypair, mint: string, sourceAta: PublicKey, toWallet: string, amountRaw: number) {
  const mintPubkey = new PublicKey(mint);
  const dest = new PublicKey(toWallet);
  const destAta = await getAssociatedTokenAddress(mintPubkey, dest);

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destAta, dest, mintPubkey),
    createTransferInstruction(sourceAta, destAta, keypair.publicKey, amountRaw)
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
async function getTokenHolders(mint: string): Promise<{ address: string; balance: number; pct: number }[]> {
  if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY required for holder snapshots");

  let allHolders: any[] = [];
  let cursor: string | null = null;
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
  const MAX_RETRIES = 5;

  do {
    let data: any;
    for (let attempt = 0; ; attempt++) {
      const heliusRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getTokenAccounts",
          params: { mint, limit: 1000, cursor, displayOptions: { showZeroBalance: false } },
        }),
      });
      const rateLimited = heliusRes.status === 429;
      data = rateLimited ? null : await heliusRes.json().catch(() => null);
      const errMsg: string | undefined = data?.error?.message;
      const transient = rateLimited || (errMsg && /rate limit|429|too many/i.test(errMsg));

      if (data && !data.error) break; // success
      if (transient && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s, 4s, 8s
        continue;
      }
      throw new Error(`Helius error: ${errMsg ?? (rateLimited ? "rate limited" : "request failed")}`);
    }
    const items: any[] = data.result?.token_accounts || [];
    allHolders.push(...items);
    cursor = data.result?.cursor;
  } while (cursor);

  const total = allHolders.reduce((sum, h) => sum + (h.amount || 0), 0);
  return allHolders
    .filter((h) => h.amount > 0 && h.owner !== "11111111111111111111111111111111")
    .map((h) => ({
      address: h.owner,
      pct: total > 0 ? ((h.amount || 0) / total) * 100 : 0,
      balance: h.amount || 0,
    }))
    .sort((a, b) => b.balance - a.balance);
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
      const { txid } = await burnTokens(keypair, sourceMint, ruleAmountRaw);
      return { type: "burn", pct: rule.pct, amountRaw: ruleAmountRaw, txid };
    }

    case "buy-burn": {
      if (!rule.targetMint) throw new Error("buy-burn requires targetMint");
      // In SOL mode the swap input is wrapped SOL; Jupiter handles wrap/unwrap of native SOL.
      const swapResult = await jupiterSwap(keypair, sourceMint, rule.targetMint, ruleAmountRaw);
      const burnResult = await burnTokens(keypair, rule.targetMint, swapResult.outAmountRaw);
      return {
        type: "buy-burn", pct: rule.pct,
        swappedRaw: ruleAmountRaw, burnedRaw: swapResult.outAmountRaw,
        swapTxid: swapResult.txid, burnTxid: burnResult.txid,
      };
    }

    case "distribute": {
      if (!rule.targetMint) throw new Error("distribute requires targetMint");
      if (!rule.holderMint) throw new Error("distribute requires holderMint");

      const swapResult = await jupiterSwap(keypair, sourceMint, rule.targetMint, ruleAmountRaw);
      const holders = await getTokenHolders(rule.holderMint);
      const distResults = await distributeTokens(keypair, rule.targetMint, holders, swapResult.outAmountRaw);

      return {
        type: "distribute", pct: rule.pct,
        swappedRaw: ruleAmountRaw, outAmountRaw: swapResult.outAmountRaw,
        swapTxid: swapResult.txid, totalHolders: holders.length,
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

export async function runPipeline(record: PipelineRecord): Promise<{ ok: boolean; results: RuleResult[]; error?: string }> {
  const results: RuleResult[] = [];

  try {
    const secret = decryptKeypair(record.encryptedKeypair).trim();
    const keypair = Keypair.fromSecretKey(
      secret.startsWith("[") ? Uint8Array.from(JSON.parse(secret)) : bs58.decode(secret)
    );

    // Step 0: claim Pump.fun creator fees (SOL) so there's something to split. Best-effort —
    // a failed/empty claim (e.g. nothing accrued yet) never aborts the run; we proceed with
    // whatever balance is already present.
    if (record.claimCreatorFees) {
      const claim = await claimCreatorFees(connection, keypair);
      if (claim.claimed) results.push({ type: "claim", pct: 0, txid: claim.txid });
      else if (claim.error) results.push({ type: "claim", pct: 0, skipped: true, note: claim.error });
    }

    const isSol = record.sourceMint === WSOL_MINT;
    let sourceBalance = 0;
    let sourceAta: PublicKey | null = null;

    if (isSol) {
      // SOL mode: the amount to split is the wallet's native SOL, minus a fee reserve.
      const lamports = await connection.getBalance(keypair.publicKey);
      sourceBalance = Math.max(0, lamports - SOL_RESERVE_LAMPORTS);
    } else {
      // SPL mode: the amount to split is the source token's ATA balance.
      const sourceMintPubkey = new PublicKey(record.sourceMint);
      sourceAta = await getAssociatedTokenAddress(sourceMintPubkey, keypair.publicKey);
      try {
        const accountInfo = await getAccount(connection, sourceAta);
        sourceBalance = Number(accountInfo.amount);
      } catch {
        return { ok: true, results }; // no reward-token account yet — not an error
      }
    }

    if (sourceBalance <= 0) return { ok: true, results };

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
