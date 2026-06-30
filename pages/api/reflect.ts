import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHolders, computeReflection, type ReflectInput, type ReflectOutput } from "../../lib/reflect";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReflectOutput | { error: string }>
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed, use POST" });

  const body = req.body as ReflectInput & { schedule?: string };
  if (!body.mint?.trim()) return res.status(400).json({ error: "mint required" });
  if (!body.rewardAmount || body.rewardAmount <= 0) return res.status(400).json({ error: "rewardAmount required" });

  const mint = body.mint.trim();
  const network = body.network === "devnet" ? "devnet" : "mainnet";

  try {
    const holders = await fetchHolders(mint, network);
    const result = computeReflection(holders, body);

    return res.status(200).json({
      mint,
      network,
      snapshot: { totalHolders: holders.length, holders },
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
