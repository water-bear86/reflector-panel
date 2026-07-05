import type { NextApiRequest, NextApiResponse } from "next";
import { createPipeline } from "../../lib/pipelineStore";
import { generatePipelineWallet } from "../../lib/walletGen";
import { validatePipelineInput } from "../../lib/validatePipelineInput";

/* ── POST /api/deploy ────────────────────────────────────────────────
   Fee-sharing model: the panel GENERATES a fresh operations wallet, stores
   the pipeline DISABLED, and returns the wallet's public key. The creator
   then sets that wallet as their token's sole fee receiver on Pump.fun and
   calls /api/activate, which verifies entitlement on-chain before enabling.
   No creator private key ever touches the app. */

// Canonical wrapped-SOL mint — creator-fee collection settles as SOL.
const WSOL_MINT = "So11111111111111111111111111111111111111112";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { feeMint, rules, ownerAddress, dropThresholdSol, pollIntervalKey } = req.body;

  const validated = validatePipelineInput({ feeMint, rules, dropThresholdSol, pollIntervalKey });
  if (!validated.ok) return res.status(400).json({ error: validated.error });
  const { mint, cleanRules, dropThresholdLamports } = validated.value;

  try {
    const wallet = generatePipelineWallet();
    const pipeline = await createPipeline({
      ownerAddress: ownerAddress || null,
      sourceMint: WSOL_MINT,
      sourceWallet: wallet.publicKey, // the generated operations wallet
      rules: cleanRules,
      intervalMinutes: validated.value.pollIntervalMinutes,
      claimCreatorFees: true,
      feeMint: mint,
      dropThresholdLamports,
      encryptedKeypair: wallet.encryptedKeypair,
      enabled: false, // stays off until entitlement is verified via /api/activate
    });

    return res.json({
      ok: true,
      id: pipeline.id,
      walletPublicKey: wallet.publicKey,
      feeMint: mint,
      pollIntervalKey: validated.value.pollIntervalKey,
      intervalMinutes: validated.value.pollIntervalMinutes,
      message:
        `Pipeline created (paused). Set this wallet as your token's fee receiver on Pump.fun, ` +
        `then activate: ${wallet.publicKey}`,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
