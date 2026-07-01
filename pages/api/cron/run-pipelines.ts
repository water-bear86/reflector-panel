import type { NextApiRequest, NextApiResponse } from "next";
import { claimDuePipelineRun, listEnabledPipelines, recordRun, isDue } from "../../../lib/pipelineStore";
import { runPipeline } from "../../../lib/pipelineExecutor";

/* ── GET /api/cron/run-pipelines ─────────────────────────────────────
   Triggered by Vercel Cron (see vercel.json). Vercel sends
   `Authorization: Bearer $CRON_SECRET` on cron-triggered requests —
   reject anything else so this can't be invoked by an outside caller. */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET env var not set — cron runs will be silently rejected");
    return res.status(200).json({ ok: true, authorized: false, ran: false, reason: "CRON_SECRET not configured" });
  }
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(200).json({ ok: true, authorized: false, ran: false });
  }

  const now = Date.now();
  const force = req.query.force === "1" || req.query.force === "true";
  const pipelines = await listEnabledPipelines();
  const summary: { id: string; ran: boolean; status?: string }[] = [];

  for (const record of pipelines) {
    if (!force && !isDue(record, now)) {
      summary.push({ id: record.id, ran: false });
      continue;
    }

    const claimed = await claimDuePipelineRun(record, now);
    if (!claimed) {
      summary.push({ id: record.id, ran: false, status: "claimed" });
      continue;
    }

    try {
      const result = await runPipeline(record);
      console.log("pipeline_run_result", JSON.stringify({
        id: record.id,
        wallet: record.sourceWallet,
        ok: result.ok,
        summary: result.summary,
        error: result.error,
        results: result.results,
      }));
      await recordRun(record.id, {
        status: result.ok ? "success" : "error",
        summary: result.ok
          ? result.summary ?? `${result.results.length} rules executed`
          : result.error || "unknown error",
        results: result.results,
      });
      summary.push({ id: record.id, ran: true, status: result.ok ? "success" : "error" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`pipeline_run_crash ${record.id}: ${msg}`);
      await recordRun(record.id, { status: "error", summary: `crash: ${msg}` });
      summary.push({ id: record.id, ran: true, status: "error" });
    }
  }

  return res.json({ ok: true, checked: pipelines.length, summary });
}
