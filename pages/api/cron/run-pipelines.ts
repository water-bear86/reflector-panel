import type { NextApiRequest, NextApiResponse } from "next";
import { claimDuePipelineRun, listEnabledPipelines, recordRun, isDue } from "../../../lib/pipelineStore";
import { runPipeline } from "../../../lib/pipelineExecutor";

/* ── GET /api/cron/run-pipelines ─────────────────────────────────────
   Triggered by Vercel Cron (see vercel.json). Vercel sends
   `Authorization: Bearer $CRON_SECRET` on cron-triggered requests —
   reject anything else so this can't be invoked by an outside caller. */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(200).json({ ok: true, authorized: false, ran: false });
  }

  const now = Date.now();
  const pipelines = await listEnabledPipelines();
  const summary: { id: string; ran: boolean; status?: string }[] = [];

  for (const record of pipelines) {
    if (!isDue(record, now)) {
      summary.push({ id: record.id, ran: false });
      continue;
    }

    const claimed = await claimDuePipelineRun(record, now);
    if (!claimed) {
      summary.push({ id: record.id, ran: false, status: "claimed" });
      continue;
    }

    const result = await runPipeline(record);
    await recordRun(record.id, {
      status: result.ok ? "success" : "error",
      // Prefer the pipeline's own reason (e.g. "below fee reserve", "no token account") over a bare
      // rule count, so a run that swapped nothing records WHY instead of a misleading "0 rules".
      summary: result.ok
        ? result.summary ?? `${result.results.length} rules executed`
        : result.error || "unknown error",
      results: result.results,
    });

    summary.push({ id: record.id, ran: true, status: result.ok ? "success" : "error" });
  }

  return res.json({ ok: true, checked: pipelines.length, summary });
}
