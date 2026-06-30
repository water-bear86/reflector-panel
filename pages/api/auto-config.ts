import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".auto-reflect-config.json");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; config?: Record<string, unknown>; snippet?: string } | { error: string }>
) {
  if (req.method === "GET") {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
        return res.status(200).json(JSON.parse(raw));
      }
      return res.status(200).json({ ok: false, config: {} });
    } catch {
      return res.status(200).json({ ok: false, config: {} });
    }
  }

  if (req.method === "POST") {
    const config = req.body as Record<string, unknown>;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    const snippet = JSON.stringify({
      jobs: [{
        enabled: config.enabled ?? true,
        label: config.label || "Auto Reflect",
        monitor_wallet: config.monitor_wallet || "CHANGE_ME",
        reward_mint: config.reward_mint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        target_mint: config.target_mint || "",
        threshold_ui: config.threshold_ui || 100,
        reward_amount: config.reward_amount || 1000,
        fee_percent: config.fee_percent || 0,
        burn_percent: config.burn_percent || 0,
        exclude_top: config.exclude_top || 0,
        exclude_bottom: config.exclude_bottom || 0,
      }]
    }, null, 2);

    return res.status(200).json({ ok: true, config, snippet });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
