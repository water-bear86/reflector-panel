import type { NextApiRequest, NextApiResponse } from "next";
import { fetchHolders, type Holder } from "../../lib/reflect";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ holders: Holder[] } | { error: string }>
) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const mint = (req.query.mint as string)?.trim();
  const network = (req.query.network as string) === "devnet" ? "devnet" : "mainnet";
  if (!mint) return res.status(400).json({ error: "mint query param required" });

  try {
    const holders = await fetchHolders(mint, network);
    return res.status(200).json({ holders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
