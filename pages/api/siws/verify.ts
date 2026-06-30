import type { NextApiRequest, NextApiResponse } from "next";
import nacl from "tweetnacl";
import bs58 from "bs58";

interface SiwsVerifyBody {
  message: string;
  signature: string; // base58 encoded
  publicKey: string; // base58 encoded
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; address?: string; error?: string }>
) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const { message, signature, publicKey } = req.body as SiwsVerifyBody;
  if (!message || !signature || !publicKey) return res.status(400).json({ ok: false, error: "Missing fields" });

  try {
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubKeyBytes = bs58.decode(publicKey);

    const valid = nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid signature" });

    return res.status(200).json({ ok: true, address: publicKey });
  } catch {
    return res.status(500).json({ ok: false, error: "Verification failed" });
  }
}
