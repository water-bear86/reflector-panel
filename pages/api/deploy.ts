import type { NextApiRequest, NextApiResponse } from "next";
import { encryptKeypair } from "../../lib/crypto";
import { cronPresetToIntervalMinutes, formatInterval } from "../../lib/schedule";
import { createPipeline } from "../../lib/pipelineStore";
import type { SplitRule } from "../../lib/pipelineStore";

/* ── POST /api/deploy ────────────────────────────────────────────────
   One call: encrypts the keypair, stores the pipeline in Supabase,
   done. Nothing else for the visitor to do — Vercel Cron picks it up
   and runs it automatically from here on. */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { sourceMint, sourceWallet, rules, cron, keypair, ownerAddress } = req.body;
  if (!sourceMint) return res.status(400).json({ error: "sourceMint required" });
  if (!Array.isArray(rules) || !rules.length) return res.status(400).json({ error: "rules required" });
  if (!keypair?.trim()) return res.status(400).json({ error: "keypair required — the pipeline can't execute without a signing key" });

  const intervalMinutes = cronPresetToIntervalMinutes(cron);

  try {
    const encryptedKeypair = encryptKeypair(keypair.trim());
    const pipeline = await createPipeline({
      ownerAddress: ownerAddress || null,
      sourceMint: sourceMint.trim(),
      sourceWallet: (sourceWallet || "").trim(),
      rules: (rules as SplitRule[]).filter((r) => r.pct > 0),
      intervalMinutes,
      encryptedKeypair,
    });

    return res.json({
      ok: true,
      id: pipeline.id,
      intervalMinutes,
      message: `Pipeline live — checks every ${formatInterval(intervalMinutes)}. Nothing else to do.`,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
