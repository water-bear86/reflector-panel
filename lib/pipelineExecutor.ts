import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
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
import type { PipelineRecord, SplitRule } from "./pipelineStore";

const HELIUS_KEY = process.env.HELIUS_API_KEY || "";
const RPC_URL = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_URL, "confirmed");
const JUPITER_API = "https://quote-api.jup.ag/v6";

export interface RuleResult {
  type: string;
  pct: number;
  [key: string]: unknown;
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
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxPriorityLamports: 1_000_000, priorityLevel: "high" } },
    }),
  });
  const swapData = await swapRes.json();
  if (!swapData.swapTransaction) throw new Error("No swap transaction returned");

  const tx = Transaction.from(Buffer.from(swapData.swapTransaction, "base64"));
  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed", skipPreflight: true });
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

/* ── Send to a single wallet — creates the destination ATA if missing ── */
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

/* ── Snapshot holders via Helius ── */
async function getTokenHolders(mint: string): Promise<{ address: string; balance: number; pct: number }[]> {
  if (!HELIUS_KEY) throw new Error("HELIUS_API_KEY required for holder snapshots");

  let allHolders: any[] = [];
  let cursor: string | null = null;
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

  do {
    const heliusRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccounts",
        params: { mint, limit: 1000, cursor, displayOptions: { showZeroBalance: false } },
      }),
    });
    const data: any = await heliusRes.json();
    if (data.error) throw new Error(`Helius error: ${data.error.message}`);
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
  sourceAta: PublicKey,
  ruleAmountRaw: number,
  rule: SplitRule
): Promise<RuleResult> {
  switch (rule.type) {
    case "burn": {
      const { txid } = await burnTokens(keypair, sourceMint, ruleAmountRaw);
      return { type: "burn", pct: rule.pct, amountRaw: ruleAmountRaw, txid };
    }

    case "buy-burn": {
      if (!rule.targetMint) throw new Error("buy-burn requires targetMint");
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
      if (!rule.targetMint) throw new Error("send requires targetMint");
      if (!rule.targetWallet) throw new Error("send requires targetWallet");
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

    const sourceMintPubkey = new PublicKey(record.sourceMint);
    const sourceAta = await getAssociatedTokenAddress(sourceMintPubkey, keypair.publicKey);

    let sourceBalance = 0;
    try {
      const accountInfo = await getAccount(connection, sourceAta);
      sourceBalance = Number(accountInfo.amount);
    } catch {
      return { ok: true, results: [] }; // no reward tokens yet — not an error
    }
    if (sourceBalance <= 0) return { ok: true, results: [] };

    for (const rule of record.rules) {
      const ruleAmountRaw = Math.floor(sourceBalance * (rule.pct / 100));
      if (ruleAmountRaw <= 0) continue;
      const result = await executeRule(keypair, record.sourceMint, sourceAta, ruleAmountRaw, rule);
      results.push(result);
    }

    return { ok: true, results };
  } catch (err: any) {
    return { ok: false, results, error: err.message };
  }
}
