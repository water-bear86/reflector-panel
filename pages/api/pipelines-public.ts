import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabase } from "../../lib/supabase";

/* ── GET /api/pipelines-public ───────────────────────────────────────
   Public, read-only, display-safe snapshot of running pipelines.
   Consumed by this site's live panel AND the wenstimmy.fun sidebar
   (hence permissive CORS). NEVER selects the encrypted keypair, and
   wallets are masked. */

const WSOL_MINT = "So11111111111111111111111111111111111111112";

function maskWallet(addr: string | null): string | null {
  if (!addr) return null;
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  try {
    // Explicit safe columns only — must never include encrypted_keypair.
    const { data, error } = await getSupabase()
      .from("pipelines")
      .select("id, source_mint, source_wallet, rules, interval_minutes, claim_creator_fees, last_run_at, last_run_status, last_run_summary, created_at")
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const pipelines = (data || []).map((p: any) => {
      const rules = Array.isArray(p.rules) ? p.rules : [];
      // Target tokens = the mints each rule buys / burns / distributes (deduped, minus empties and wSOL).
      const targetTokens: string[] = Array.from(
        new Set(
          rules
            .map((r: any) => (r.targetMint || "").trim())
            .filter((m: string) => m && m !== WSOL_MINT)
        )
      );
      return {
        id: String(p.id).slice(0, 8),
        wallet: maskWallet(p.source_wallet),
        source: p.claim_creator_fees ? "creator-rewards" : p.source_mint || null,
        targetTokens,
        rules: rules.map((r: any) => ({ type: r.type, pct: r.pct })),
        intervalMinutes: p.interval_minutes,
        lastRunStatus: p.last_run_status ?? null,
        lastRunSummary: p.last_run_summary ?? null,
        lastRunAt: p.last_run_at ?? null,
        createdAt: p.created_at,
      };
    });

    // Flat, deduped token list — convenient for the wenstimmy sidebar.
    const tokens: string[] = Array.from(new Set(pipelines.flatMap((p) => p.targetTokens)));

    return res.status(200).json({ ok: true, count: pipelines.length, pipelines, tokens });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
