import { useEffect, useState } from "react";

interface PublicRule {
  type: string;
  pct: number;
}
interface PublicPipeline {
  id: string;
  wallet: string | null;
  source: string | null;
  targetTokens: string[];
  rules: PublicRule[];
  intervalMinutes: number;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

const ACTION_ICON: Record<string, string> = {
  "buy-burn": "🔄",
  burn: "🔥",
  distribute: "📤",
  send: "💸",
};

function shortMint(m: string): string {
  return m.length > 10 ? `${m.slice(0, 4)}…${m.slice(-4)}` : m;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtInterval(min: number): string {
  if (min % 1440 === 0) return `${min / 1440}d`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}

function PipeCard({ p }: { p: PublicPipeline }) {
  const ok = p.lastRunStatus === "success";
  const err = p.lastRunStatus === "error";
  const pending = !p.lastRunStatus;
  return (
    <div className="shrink-0 rounded-xl border border-cyan-400/20 bg-surface-800/60 backdrop-blur p-3 w-full">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-mono text-slate-300">
          <span
            className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : pending ? "bg-cyan-400" : "bg-rose-400"} ${ok || pending ? "animate-pulse" : ""}`}
          />
          {p.wallet ?? "—"}
        </span>
        <span className="text-[10px] font-mono text-slate-500">every {fmtInterval(p.intervalMinutes)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.targetTokens.length ? (
          p.targetTokens.map((t) => (
            <a
              key={t}
              href={`https://solscan.io/token/${t}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-200 font-mono text-[11px] hover:bg-fuchsia-500/25 transition"
            >
              {shortMint(t)}
            </a>
          ))
        ) : (
          <span className="text-[11px] text-slate-500 font-mono">no target yet</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.source === "creator-rewards" && (
          <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-400/25 text-cyan-300 text-[10px]">
            creator rewards
          </span>
        )}
        {p.rules.map((r, i) => (
          <span key={i} className="px-1.5 py-0.5 rounded-md bg-surface-900/70 border border-slate-700/40 text-slate-300 text-[10px]">
            {ACTION_ICON[r.type] ?? "•"} {r.pct}%
          </span>
        ))}
        <span className="ml-auto text-[10px] text-slate-500">{timeAgo(p.lastRunAt)}</span>
      </div>

      {err && p.lastRunSummary && (
        <div className="mt-2 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-300 font-mono truncate" title={p.lastRunSummary}>
          {p.lastRunSummary.length > 60 ? p.lastRunSummary.slice(0, 60) + "…" : p.lastRunSummary}
        </div>
      )}
    </div>
  );
}

export default function LivePipelines() {
  const [pipes, setPipes] = useState<PublicPipeline[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/pipelines-public");
        const data = await res.json();
        if (alive && data.ok) setPipes(data.pipelines || []);
      } catch {
        /* keep last known */
      } finally {
        if (alive) setLoaded(true);
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Duplicate the list so the vertical scroll loops seamlessly (only when there's enough to scroll).
  const scroll = pipes.length > 3;
  const items = scroll ? [...pipes, ...pipes] : pipes;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-cyan-300 tracking-wide">Live Pipelines</h3>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {pipes.length} running
        </span>
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
      ) : pipes.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No pipelines running yet.</p>
      ) : (
        <div className="live-viewport">
          <div className={`live-track ${scroll ? "is-scrolling" : ""}`}>
            {items.map((p, i) => (
              <PipeCard key={`${p.id}-${i}`} p={p} />
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .live-viewport {
          max-height: 320px;
          overflow: hidden;
          position: relative;
          mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
        }
        .live-track {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .live-track.is-scrolling {
          animation: live-scroll 24s linear infinite;
        }
        .live-viewport:hover .live-track.is-scrolling {
          animation-play-state: paused;
        }
        @keyframes live-scroll {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(-50%);
          }
        }
      `}</style>
    </div>
  );
}
