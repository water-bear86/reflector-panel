import { useEffect, useState } from "react";

interface PublicRule {
  type: string;
  pct: number;
}
interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
}
interface PublicPipeline {
  id: string;
  wallet: string | null;
  source: string | null;
  feeMint?: string | null;
  primaryMint?: string | null;
  token?: TokenInfo | null;
  targetTokens: string[];
  rules: PublicRule[];
  intervalMinutes: number;
  totalOutSol?: number;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

function shortMint(m: string): string {
  return m.length > 10 ? `${m.slice(0, 4)}…${m.slice(-4)}` : m;
}

type Tab = "all" | "live" | "pending";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "all pipes" },
  { key: "live", label: "live" },
  { key: "pending", label: "new" },
];

function StatusBadge({ status }: { status: string | null }) {
  const map =
    status === "success"
      ? { cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", dot: "bg-emerald-400", label: "live" }
      : status === "error"
      ? { cls: "bg-rose-500/15 border-rose-500/30 text-rose-300", dot: "bg-rose-400", label: "attention" }
      : { cls: "bg-pink-500/15 border-pink-400/30 text-pink-300", dot: "bg-pink-400", label: "new" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none border text-[10px] font-medium ${map.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-none ${map.dot} animate-pulse`} />
      {map.label}
    </span>
  );
}

function fmtSol(n: number): string {
  if (n === 0) return "0";
  if (n < 0.001) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  return n.toFixed(3);
}

/* A pipeline's token as a card for the carousel — ticker, image, SOL sent out. */
function TokenCard({ p }: { p: PublicPipeline }) {
  const [imgErr, setImgErr] = useState(false);
  const t = p.token;
  const mint = t?.mint || p.primaryMint || "";
  const ticker = t?.symbol ? `$${t.symbol}` : mint ? shortMint(mint) : "—";
  const initial = ((t?.symbol || mint || "?").trim()[0] || "?").toUpperCase();
  const showImg = t?.image && !imgErr;
  const outSol = p.totalOutSol ?? 0;

  return (
    <a
      href={mint ? `https://pump.fun/coin/${mint}` : "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-48 shrink-0 snap-start glass-card p-4 hover:brightness-110 transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t!.image as string}
            alt={ticker}
            onError={() => setImgErr(true)}
            className="w-11 h-11 rounded-none object-cover border border-white/10 shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-none bg-gradient-to-br from-fuchsia-500/30 to-pink-500/30 border border-white/10 flex items-center justify-center text-base font-bold text-white shrink-0">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{ticker}</div>
          <StatusBadge status={p.lastRunStatus} />
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">SOL sent out</div>
        <div className="text-lg font-bold text-pink-300 font-mono leading-tight">◎ {fmtSol(outSol)}</div>
      </div>
    </a>
  );
}

export default function PipelinesTable() {
  const [pipes, setPipes] = useState<PublicPipeline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

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

  const running = pipes.filter((p) => p.lastRunStatus === "success").length;
  const targets = new Set(pipes.flatMap((p) => p.targetTokens)).size;

  const filtered = pipes.filter((p) => {
    if (tab === "live") return p.lastRunStatus === "success";
    if (tab === "pending") return !p.lastRunStatus;
    return true; // "all"
  });

  return (
    <div className="space-y-5">
      {/* Stats row (perpad "positions" stats analog) */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "pipes running", value: String(pipes.length) },
          { label: "airdropping now", value: String(running) },
          { label: "target tokens", value: String(targets) },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4">
            <div className="text-2xl font-bold text-white font-mono">{s.value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-none text-xs font-medium whitespace-nowrap transition-colors ${
                active ? "bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200" : "text-slate-400 hover:text-slate-200"
              }`}
              aria-pressed={active}
              aria-label={`Filter pipelines by ${t.label}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Carousel — one token card per pipe */}
      {!loaded ? (
        <div className="glass-card py-10 text-center text-slate-500 text-xs">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card py-12 text-center">
          <div className="text-2xl mb-2 opacity-60">🪄</div>
          <p className="text-xs text-slate-400 font-medium">No pipes here yet</p>
          <p className="text-[11px] text-slate-500 mt-1">Build the first one below.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
          {filtered.map((p) => (
            <TokenCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
