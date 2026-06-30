import type { NextApiRequest, NextApiResponse } from "next";

const HELIUS_KEY = process.env.HELIUS_API_KEY || "";
const MAINNET_RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

interface TokenBalance {
  mint: string;
  wallet: string;
  balance: number;
  decimals: number;
  uiAmount: number;
}

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenBalance | { error: string }>
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mint = (req.method === "POST" ? (req.body as any)?.mint : req.query.mint) as string;
  const wallet = (req.method === "POST" ? (req.body as any)?.wallet : req.query.wallet) as string;

  if (!mint?.trim() || !wallet?.trim()) {
    return res.status(400).json({ error: "mint and wallet required" });
  }

  try {
    // Get token accounts by owner
    const accounts = await fetchJsonRpc("getTokenAccountsByOwner", [
      wallet,
      { mint: mint.trim() },
      { encoding: "jsonParsed" },
    ]);

    let totalBalance = 0;
    let decimals = 0;

    for (const acc of accounts.value) {
      const info = acc.account?.data?.parsed?.info;
      if (!info) continue;
      decimals = info.tokenAmount?.decimals || 0;
      totalBalance += Number(info.tokenAmount?.amount || 0);
    }

    const uiAmount = decimals > 0 ? totalBalance / 10 ** decimals : totalBalance;

    return res.status(200).json({
      mint: mint.trim(),
      wallet: wallet.trim(),
      balance: totalBalance,
      decimals,
      uiAmount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
