import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHolders } from "../../lib/reflect";

/* ── types ─────────────────────────────────────────────────────────── */

interface SplitRule {
  type: "burn" | "buy-burn" | "distribute" | "send";
  pct: number;
  targetMint: string;
  targetWallet: string;
  holderMint: string;
}

interface ReflectInput {
  sourceMint: string;
  sourceWallet: string;
  network?: "devnet" | "mainnet";
  rules: SplitRule[];
}

interface RuleResult {
  type: string;
  pct: number;
  targetMint: string;
  targetWallet: string;
  holderMint: string;
  estimatedAmount: number;
  holders?: { address: string; balance: number; percentage: number; receive: number }[];
}

interface ReflectOutput {
  sourceMint: string;
  sourceWallet: string;
  network: string;
  totalBalance: number;
  rules: RuleResult[];
}

/* ── RPC helpers ────────────────────────────────────────────────────── */

const HELIUS_KEY = process.env.HELIUS_API_KEY || "";
const MAINNET_RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

async function fetchJsonRpc(method: string, params: unknown[]) {
  const res = await fetch(MAINNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function getTokenBalance(mint: string, wallet: string): Promise<number> {
  try {
    const accounts = await fetchJsonRpc("getTokenAccountsByOwner", [
      wallet,
      { mint },
      { encoding: "jsonParsed" },
    ]);
    let total = 0;
    for (const acc of accounts.value) {
      const amt = acc.account?.data?.parsed?.info?.tokenAmount;
      if (amt) total += Number(amt.uiAmount || 0);
    }
    return total;
  } catch {
    return -1; // signal "could not check"
  }
}

/* ── handler ────────────────────────────────────────────────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReflectOutput | { error: string }>
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as ReflectInput;
  if (!body.sourceMint?.trim()) return res.status(400).json({ error: "sourceMint required" });
  if (!body.rules?.length) return res.status(400).json({ error: "rules required" });

  const sourceMint = body.sourceMint.trim();
  const sourceWallet = (body.sourceWallet || "").trim();
  const network = body.network === "devnet" ? "devnet" : "mainnet";

  try {
    // Check actual balance of reward token
    let balance = 0;
    if (sourceWallet) {
      balance = await getTokenBalance(sourceMint, sourceWallet);
      if (balance < 0) balance = 0;
    }

    const results: RuleResult[] = [];

    for (const rule of body.rules) {
      const pool = balance * (rule.pct / 100);

      if (rule.type === "distribute" && rule.holderMint) {
        // Snapshot holders of the holder token
        const holders = await fetchHolders(rule.holderMint, network);
        // Recalculate for eligible subset
        const totalHeld = holders.reduce((s, h) => s + h.balance, 0);
        const distHolders = holders.map((h) => ({
          address: h.address,
          balance: h.balance,
          percentage: totalHeld > 0 ? Math.round((h.balance / totalHeld) * 10000) / 100 : 0,
          receive: totalHeld > 0 ? pool * (h.balance / totalHeld) : 0,
        }));
        results.push({
          type: "distribute", pct: rule.pct, targetMint: rule.targetMint,
          targetWallet: rule.targetWallet, holderMint: rule.holderMint,
          estimatedAmount: pool, holders: distHolders,
        });
      } else {
        results.push({
          type: rule.type, pct: rule.pct, targetMint: rule.targetMint,
          targetWallet: rule.targetWallet, holderMint: rule.holderMint,
          estimatedAmount: pool,
        });
      }
    }

    return res.status(200).json({
      sourceMint, sourceWallet, network, totalBalance: balance, rules: results,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}
