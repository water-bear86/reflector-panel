import type { NextApiRequest, NextApiResponse } from "next";
import { validatePipelineInput } from "../../lib/validatePipelineInput";
import { fetchTokenInfoBatch } from "../../lib/tokenMeta";
import { feeLamportsForInterval } from "../../lib/pollIntervalTiers";

/* ── POST /api/validate ──────────────────────────────────────────────
   Dry run of the exact checks /api/deploy applies (shared via
   validatePipelineInput), plus a best-effort on-chain lookup of every
   referenced mint. No wallet is generated and nothing is written to the
   database — this only reports whether "Create pipeline" would succeed. */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const { feeMint, rules, dropThresholdSol, pollIntervalMinutes } = req.body;
  const validated = validatePipelineInput({ feeMint, rules, dropThresholdSol, pollIntervalMinutes });
  if (!validated.ok) return res.status(200).json({ ok: false, error: validated.error });

  const { mint, cleanRules } = validated.value;
  const mints = new Set<string>([mint]);
  for (const r of cleanRules) {
    if (r.holderMint) mints.add(r.holderMint);
    if (r.targetMint) mints.add(r.targetMint);
  }

  const warnings: string[] = [];
  try {
    const info = await fetchTokenInfoBatch(Array.from(mints));
    for (const m of mints) {
      if (!info.get(m)) warnings.push(`${m.slice(0, 4)}…${m.slice(-4)} — no on-chain token data found, double-check this address`);
    }
  } catch {
    // Best-effort only — a Helius hiccup shouldn't block validation.
  }

  // Echo back the exact normalized shape /api/deploy would persist, so the client can render
  // the precise workflow that pressing "Create pipeline" is about to lock in.
  return res.status(200).json({
    ok: true,
    warnings,
    feeMint: mint,
    rules: cleanRules,
    dropThresholdLamports: validated.value.dropThresholdLamports,
    pollIntervalMinutes: validated.value.pollIntervalMinutes,
    intervalFeeLamports: feeLamportsForInterval(validated.value.pollIntervalMinutes),
  });
}
