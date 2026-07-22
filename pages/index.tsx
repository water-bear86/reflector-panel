import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSiws } from "../hooks/useSiws";
import PipelinesTable from "../components/PipelinesTable";
import LiveStatsStrip from "../components/LiveStatsStrip";
import FirstTimeTutorial from "../components/FirstTimeTutorial";
import { HOLDER_MODE_MAX_RECIPIENTS } from "../lib/lotteryDistribution";
import type { HolderMode } from "../lib/lotteryDistribution";
import { POLL_INTERVAL_PRESETS, DEFAULT_POLL_INTERVAL_KEY } from "../lib/pollInterval";
import type { PollIntervalKey } from "../lib/pollInterval";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type RuleType = "burn" | "buy-burn" | "distribute" | "send";

interface DraftRule {
  type: RuleType;
  pct: number;
  targetMint?: string;
  targetWallet?: string;
  holderMint?: string;
  holderMode?: HolderMode;
}

interface Draft {
  feeMint?: string;
  rules?: DraftRule[];
  dropThresholdSol?: number;
  pollIntervalKey?: PollIntervalKey;
}

const RULE_LABEL: Record<RuleType, string> = {
  "buy-burn": "Swap → Burn",
  burn: "Burn tokens",
  distribute: "Increase ATA holders",
  send: "Send to wallet",
};

// Which rule actions the form offers, with the value-prop framing.
const RULE_OPTIONS: { type: RuleType; label: string; hint: string }[] = [
  { type: "distribute", label: "📣 Airdrop to holders", hint: "Send the swapped token to holders of another token (Exposure) or your own (Rewards)." },
  { type: "buy-burn", label: "🔥 Buy back & burn", hint: "Swap fees into a token and burn it forever (Deflation)." },
  { type: "send", label: "💸 Send to a wallet", hint: "Route the SOL straight to a wallet you choose." },
];

// Holder-reach modes for airdrops — the payout split is always equal, so a lower cap on
// recipients means a bigger share per holder, and a higher cap means broader reach.
const HOLDER_MODES: { key: HolderMode; label: string; hint: string }[] = [
  { key: "bless", label: "Bless", hint: "10 lucky holders per distribution" },
  { key: "here", label: "@Here", hint: "A thicker spread" },
  { key: "spam", label: "Spam", hint: "Max holders per buy" },
];

const newRule = (): DraftRule => ({ type: "distribute", pct: 0, targetMint: "", targetWallet: "", holderMint: "", holderMode: "spam" });

const TUTORIAL_SEEN_KEY = "wenstimmy_tutorial_seen_v1";

function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="reflector-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d946ef" />
          <stop offset="55%" stopColor="#db2777" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#reflector-logo-grad)" opacity="0.18" />
      <path d="M13 9h9.5a6.5 6.5 0 0 1 3 12.3L31 31h-5.4l-4.7-8.7H17V31h-4V9Zm4 3.4v6.4h5.3a3.2 3.2 0 0 0 0-6.4H17Z" fill="url(#reflector-logo-grad)" />
    </svg>
  );
}

// Header mark: a coin that keeps flipping between "S" (Stimmy) and "?" (wen?) — a nod to the
// gambling/pump.fun spirit of the app, distinct from the plain "R" wordmark used elsewhere.
function CoinLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <span className={`coin-spin inline-block shrink-0 ${className}`} aria-hidden="true">
      <span className="coin-spin-inner">
        <span className="coin-face coin-face-front flex items-center justify-center bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white font-black text-base leading-none">
          S
        </span>
        <span className="coin-face coin-face-back flex items-center justify-center bg-gradient-to-br from-pink-600 to-fuchsia-500 text-white font-black text-base leading-none">
          ?
        </span>
      </span>
    </span>
  );
}

/* Pump.fun pill icon */
function PumpIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(45 50 50)">
        <rect x="30" y="10" width="40" height="80" rx="20" fill="#ffffff" />
        <path d="M30 50 H70 V70 A20 20 0 0 1 50 90 A20 20 0 0 1 30 70 Z" fill="#4fd18a" />
        <rect x="30" y="10" width="40" height="80" rx="20" fill="none" stroke="#14432f" strokeWidth="7" />
        <line x1="30" y1="50" x2="70" y2="50" stroke="#14432f" strokeWidth="7" />
        <path d="M40 71 a9 9 0 0 0 2 8" stroke="#ffffff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="45" cy="83" r="2" fill="#ffffff" />
      </g>
    </svg>
  );
}

/* Explorer "Q" icon — teal ring + purple core */
function ScanIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="none"
        stroke="#25e6b8"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray="176 44"
        transform="rotate(58 50 50)"
      />
      <circle cx="50" cy="50" r="18" fill="#b44ce0" />
    </svg>
  );
}

/* GitHub mark */
function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function CircuitBackground() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.18]"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid slice"
    >
      <defs>
        <pattern id="circuit-dots" width="46" height="46" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.4" fill="#ec4899" opacity="0.7" />
          <path d="M1 1 L1 23 L23 23 L23 45" stroke="#ec4899" strokeWidth="0.6" opacity="0.32" fill="none" />
        </pattern>
        <radialGradient id="circuit-fade" cx="80%" cy="35%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="circuit-mask">
          <rect width="100%" height="100%" fill="url(#circuit-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit-dots)" mask="url(#circuit-mask)" />
    </svg>
  );
}

function rulesTotal(rules?: DraftRule[]): number {
  return (rules || []).reduce((s, r) => s + (r.pct || 0), 0);
}

// ── Our token. ──
const STIMMY = {
  ticker: "$STIMMY",
  mint: "6VVfQ7Y3qBEDi4ybx3QwzPYvjp93qWkcEdHbf1SXpump",
  x: "https://x.com/wenstimmyfun",
  telegram: "",
  blurb:
    "The token behind the panel. Wen Stimmy runs its own Pump.fun creator fees through this exact tool — the airdrop machine eating its own cooking.",
};

function shortMint(m: string): string {
  return m.length > 12 ? `${m.slice(0, 5)}…${m.slice(-5)}` : m;
}

function fmtSol(n: number): string {
  if (n === 0) return "0";
  if (n < 0.001) return n.toFixed(6);
  if (n < 1) return n.toFixed(4);
  return n.toFixed(3);
}

interface HudToken {
  symbol?: string;
  image?: string | null;
}

// The exact rule shape /api/validate echoes back — normalized/trimmed, matching what
// /api/deploy would persist verbatim.
interface ValidatedRule {
  type: RuleType;
  pct: number;
  targetMint?: string;
  targetWallet?: string;
  holderMint?: string;
  holderMode?: HolderMode;
}

function tokenLabel(mint: string, tokenInfo: Record<string, HudToken>): string {
  const sym = tokenInfo[mint]?.symbol;
  return sym ? `$${sym}` : shortMint(mint);
}

// Plain-English recap of exactly what a rule will do at runtime — this is what gets shown
// as "the exact workflow that will be generated" before the user commits to creating it.
function describeRule(r: ValidatedRule, tokenInfo: Record<string, HudToken>): string {
  if (r.type === "distribute") {
    const mode = HOLDER_MODES.find((m) => m.key === (r.holderMode || "spam"));
    const cap = HOLDER_MODE_MAX_RECIPIENTS[r.holderMode || "spam"];
    return `${r.pct}% — swap into ${tokenLabel(r.targetMint || "", tokenInfo)} and airdrop it to up to ${cap} holders of ${tokenLabel(r.holderMint || "", tokenInfo)} (${mode?.label ?? "Spam"} mode)`;
  }
  if (r.type === "buy-burn") {
    return `${r.pct}% — swap into ${tokenLabel(r.targetMint || "", tokenInfo)} and burn it forever`;
  }
  if (r.type === "send") {
    return `${r.pct}% — send SOL directly to ${shortMint(r.targetWallet || "")}`;
  }
  return `${r.pct}% — ${r.type}`;
}

// Rough per-holder estimate shown under the drop threshold field: assumes the rule's full
// holder-mode cap gets reached, so a real round may reach fewer holders (and pay each one
// more) if there aren't that many candidates, or the pool can't cover every recipient's rent.
function estimateDistributePayout(r: DraftRule, dropThresholdSol: number, tokenInfo: Record<string, HudToken>): string {
  const cap = HOLDER_MODE_MAX_RECIPIENTS[r.holderMode || "spam"];
  const ruleSol = dropThresholdSol * (r.pct / 100);
  const perHolderSol = cap > 0 ? ruleSol / cap : 0;
  const label = r.targetMint?.trim() ? tokenLabel(r.targetMint.trim(), tokenInfo) : "the airdrop token";
  return `~${cap} holders × ~${fmtSol(perHolderSol)} SOL worth of ${label} each`;
}

function TokenDetails() {
  const hasMint = STIMMY.mint.trim().length > 0;
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard?.writeText(STIMMY.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 leading-relaxed">{STIMMY.blurb}</p>
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Ticker</span>
        <span className="text-white font-mono text-sm">{STIMMY.ticker}</span>
      </div>
      <div>
        <span className="text-slate-400 text-sm block mb-1">Contract</span>
        {hasMint ? (
          <div className="flex gap-2">
            <code className="dazzle-contract glass-input font-mono text-sm flex-1 break-all py-1.5">{shortMint(STIMMY.mint)}</code>
            <button
              aria-label={copied ? "Contract address copied" : "Copy contract address to clipboard"}
              className={`dazzle-copy btn-secondary text-sm shrink-0 py-1.5 px-3 ${copied ? "dazzle-copied" : ""}`}
              onClick={doCopy}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-fuchsia-500/10 border border-fuchsia-400/25 text-fuchsia-200 text-sm font-medium">
            Not launched yet
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {hasMint && (
          <a href={`https://pump.fun/coin/${STIMMY.mint}`} target="_blank" rel="noopener noreferrer" className="dazzle-chip px-3 py-1.5 rounded-none bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-200 text-sm hover:bg-fuchsia-500/25 transition">
            Pump.fun ↗
          </a>
        )}
        {hasMint && (
          <a href={`https://solscan.io/token/${STIMMY.mint}`} target="_blank" rel="noopener noreferrer" className="dazzle-chip px-3 py-1.5 rounded-none bg-surface-800 border border-slate-700/50 text-slate-300 text-sm hover:border-slate-500/60 transition">
            Solscan ↗
          </a>
        )}
        {STIMMY.x && (
          <a href={STIMMY.x} target="_blank" rel="noopener noreferrer" className="dazzle-chip px-3 py-1.5 rounded-none bg-surface-800 border border-slate-700/50 text-slate-300 text-sm hover:border-slate-500/60 transition">
            𝕏 ↗
          </a>
        )}
        {STIMMY.telegram && (
          <a href={STIMMY.telegram} target="_blank" rel="noopener noreferrer" className="dazzle-chip px-3 py-1.5 rounded-none bg-surface-800 border border-slate-700/50 text-slate-300 text-sm hover:border-slate-500/60 transition">
            Telegram ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { signedIn, signing, signIn, signOut } = useSiws();

  const [draft, setDraft] = useState<Draft>({ rules: [{ ...newRule(), pct: 100 }] });
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [bannerAnim, setBannerAnim] = useState<object | null>(null);

  // Fetched at runtime (not bundled) — the animation JSON is ~180KB.
  useEffect(() => {
    fetch("/banner-lottie.json")
      .then((r) => r.json())
      .then(setBannerAnim)
      .catch(() => {
        /* leave null — the placeholder box below just stays put */
      });
  }, []);

  // First-run walkthrough — shows once automatically, then only via the header's "?" button.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_SEEN_KEY)) setShowTutorial(true);
    } catch {
      /* localStorage unavailable (private browsing etc.) — just skip auto-show */
    }
  }, []);

  const closeTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      /* nothing to persist — it'll just show again next visit */
    }
  };

  const rules = draft.rules || [];
  const setRules = (r: DraftRule[]) => setDraft((d) => ({ ...d, rules: r }));
  const addRule = () => setRules([...rules, newRule()]);
  const removeRule = (i: number) => setRules(rules.filter((_, idx) => idx !== i));
  const updateRule = (i: number, patch: Partial<DraftRule>) =>
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // A rule is only usable once its type-specific target fields are filled — otherwise
  // it deploys fine but dies on the first run (e.g. "distribute requires targetMint").
  const ruleComplete = (r: DraftRule): boolean => {
    if (r.type === "distribute") return !!r.holderMint?.trim() && !!r.targetMint?.trim();
    if (r.type === "buy-burn") return !!r.targetMint?.trim();
    if (r.type === "send") return !!r.targetWallet?.trim();
    return true; // burn needs no target
  };
  const total = rulesTotal(rules);
  const rulesOk = rules.length > 0 && total === 100 && rules.every(ruleComplete);
  const mintOk = !!draft.feeMint?.trim();
  // Pressing VALIDATE is mandatory, not just advisory — creation is permanent (no edit
  // endpoint exists once a pipeline is live), so the button stays locked until the exact
  // workflow has been reviewed and confirmed valid for the current draft.
  const validated = validateResult?.ok === true;
  const canCreate = mintOk && rulesOk && validated;
  const activated = activateResult?.activated === true;

  const pollIntervalKey = draft.pollIntervalKey ?? DEFAULT_POLL_INTERVAL_KEY;
  const pollIntervalPreset = POLL_INTERVAL_PRESETS.find((p) => p.key === pollIntervalKey)!;

  // Every distinct token mint the form references — resolved live for the HUD.
  const referencedMints = useMemo(() => {
    const s = new Set<string>();
    const add = (m?: string) => { const t = (m || "").trim(); if (t) s.add(t); };
    add(draft.feeMint);
    for (const r of rules) { add(r.holderMint); add(r.targetMint); }
    return Array.from(s);
  }, [draft.feeMint, rules]);

  const [tokenInfo, setTokenInfo] = useState<Record<string, HudToken>>({});
  const mintsKey = referencedMints.join(",");
  useEffect(() => {
    if (!mintsKey) { setTokenInfo({}); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/token-info?mints=${encodeURIComponent(mintsKey)}`);
        const data = await res.json();
        if (alive && data.ok) setTokenInfo(data.tokens || {});
      } catch {
        /* keep last known */
      }
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [mintsKey]);

  // Any edit invalidates a prior VALIDATE result — stale "looks good" would be misleading.
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    setValidateResult(null);
  }, [draft.feeMint, rulesKey, draft.dropThresholdSol, draft.pollIntervalKey]);

  const deploy = async () => {
    setDeploying(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeMint: draft.feeMint?.trim() || "",
          rules: (draft.rules || []).filter((r) => r.pct > 0).map((r) => ({
            type: r.type,
            pct: r.pct,
            targetMint: (r.targetMint || "").trim(),
            targetWallet: (r.targetWallet || "").trim(),
            holderMint: (r.holderMint || "").trim(),
            holderMode: r.holderMode,
          })),
          dropThresholdSol: draft.dropThresholdSol ?? undefined,
          pollIntervalKey,
          ownerAddress: signedIn ? publicKey?.toBase58() : undefined,
        }),
      });
      const data = await res.json();
      setDeployResult(data);
    } catch (err: any) {
      setDeployResult({ ok: false, error: err.message });
    } finally {
      setDeploying(false);
    }
  };

  const validate = async () => {
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeMint: draft.feeMint?.trim() || "",
          rules: (draft.rules || []).filter((r) => r.pct > 0).map((r) => ({
            type: r.type,
            pct: r.pct,
            targetMint: (r.targetMint || "").trim(),
            targetWallet: (r.targetWallet || "").trim(),
            holderMint: (r.holderMint || "").trim(),
            holderMode: r.holderMode,
          })),
          dropThresholdSol: draft.dropThresholdSol ?? undefined,
          pollIntervalKey,
        }),
      });
      const data = await res.json();
      setValidateResult(data);
    } catch (err: any) {
      setValidateResult({ ok: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  const activate = async () => {
    if (!deployResult?.id) return;
    setActivating(true);
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deployResult.id }),
      });
      const data = await res.json();
      setActivateResult(data);
    } catch (err: any) {
      setActivateResult({ ok: false, error: err.message });
    } finally {
      setActivating(false);
    }
  };

  const resetAll = () => {
    setDraft({ rules: [{ ...newRule(), pct: 100 }] });
    setDeployResult(null);
    setActivateResult(null);
  };

  return (
    <main id="top" className="relative min-h-screen bg-gradient-to-br from-surface-900 via-surface-900 to-pink-900/40 overflow-hidden">
      <CircuitBackground />

      <header className="fixed top-0 inset-x-0 z-50 glass-card rounded-none border-b border-slate-700/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <a href="#top" data-tour="brand" className="flex items-center gap-2.5 shrink-0">
              <CoinLogo className="w-9 h-9" />
              <span className="text-lg font-bold text-white tracking-tight hidden sm:block">wen stimmy</span>
            </a>
            <nav className="flex items-center gap-1 text-sm">
              <a href="#pipes" className="px-2.5 py-1.5 rounded-none text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors">pipes</a>
              <a href="#create" className="px-2.5 py-1.5 rounded-none text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors">create</a>
              <a href="/docs" className="px-2.5 py-1.5 rounded-none text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors">docs</a>
              <button onClick={() => setMenuOpen(true)} className="px-2.5 py-1.5 rounded-none text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors">token</button>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setShowTutorial(true)}
              title="How this works"
              aria-label="Open tutorial"
              className="w-9 h-9 flex items-center justify-center rounded-none bg-surface-700 border border-white/[0.04] text-slate-200 text-sm font-bold hover:text-pink-300 hover:border-pink-400/30 transition-colors shrink-0"
            >
              ?
            </button>
            {/* Social links (mirrors the sidebar) */}
            <div className="hidden sm:flex items-center gap-1.5">
              <a href={STIMMY.x} target="_blank" rel="noopener noreferrer" title="X / Twitter" className="w-9 h-9 flex items-center justify-center rounded-none bg-surface-700 border border-white/[0.04] text-slate-200 text-sm hover:text-white transition-colors">
                𝕏
              </a>
              <a href={`https://pump.fun/coin/${STIMMY.mint}`} target="_blank" rel="noopener noreferrer" title="Pump.fun" className="w-9 h-9 flex items-center justify-center rounded-none bg-surface-700 border border-white/[0.04] hover:bg-surface-600 transition-colors">
                <PumpIcon className="w-5 h-5" />
              </a>
              <a href={`https://solscan.io/token/${STIMMY.mint}`} target="_blank" rel="noopener noreferrer" title="Explorer" className="w-9 h-9 flex items-center justify-center rounded-none bg-surface-700 border border-white/[0.04] hover:bg-surface-600 transition-colors">
                <ScanIcon className="w-5 h-5" />
              </a>
              <a href="https://github.com/YATSPAT/YATSPAT" target="_blank" rel="noopener noreferrer" title="GitHub (YATSPAT)" className="w-9 h-9 flex items-center justify-center rounded-none bg-surface-700 border border-white/[0.04] text-slate-200 hover:text-white transition-colors">
                <GithubIcon className="w-5 h-5" />
              </a>
            </div>
            <WalletMultiButton style={{ background: connected ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #a21caf, #ec4899)", borderRadius: "0", height: "2.5rem", fontSize: "0.8rem", padding: "0 0.85rem", whiteSpace: "nowrap" }} />
            {connected && (signedIn ? (
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                <span className="w-2 h-2 rounded-none bg-emerald-400 animate-pulse" /> SIWS ✓
              </button>
            ) : (
              <button onClick={signIn} disabled={signing} className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-pink-500/15 border border-pink-400/30 text-pink-300 text-xs font-medium hover:bg-pink-500/25 transition-all disabled:opacity-50">
                {signing ? "Signing…" : "Sign In With Solana"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Slide-out sidebar (opened from the header menu button) */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-200 ${menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={`fixed top-0 left-0 z-[70] h-full w-80 max-w-[85vw] transform transition-transform duration-300 ease-out ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-full glass-card rounded-none overflow-y-auto p-5 space-y-5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <Logo className="w-8 h-8" />
              <span className="text-lg font-bold text-white">Wen Stimmy</span>
            </span>
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="dazzle-close">
              <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="sidebar-accent-bar -mx-5" />

          <div>
            <h4 className="sidebar-heading-dazzle flex items-center text-xs font-bold uppercase tracking-wider text-pink-300 mb-2.5">
              <span className="sidebar-label-tick" />
              Our token
            </h4>
            <TokenDetails />
          </div>
        </div>
      </aside>

      <FirstTimeTutorial open={showTutorial} onClose={closeTutorial} />

      {/* Live stats strip — real platform numbers instead of a promo ticker */}
      <div className="pt-[68px]">
        <LiveStatsStrip />
      </div>

      {/* Hero */}
      <section className="relative max-w-4xl mx-auto pt-16 pb-10 px-4 text-center">
        <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.05]">
          Airdrop{" "}
          <span className="italic bg-gradient-to-r from-fuchsia-400 via-pink-400 to-pink-300 bg-clip-text text-transparent">anyone</span>{" "}
          with pump.fun creator fees.
        </h1>
        <div className="mt-6 max-w-2xl mx-auto rounded-none overflow-hidden border border-white/[0.06] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]">
          {bannerAnim ? (
            <Lottie animationData={bannerAnim} loop autoplay className="w-full h-auto block" />
          ) : (
            <div className="w-full aspect-[5/1] bg-surface-900" />
          )}
        </div>
        <div className="mt-7 flex items-center justify-center gap-3">
          <a href="#create" className="btn-deploy inline-block !py-3 !px-7">⚡ Create a pipeline</a>
          <a href="#pipes" className="btn-secondary inline-block !py-3 !px-6">See live pipes</a>
        </div>
      </section>

      {/* Live pipes dashboard (perpad listings-table analog) */}
      <section id="pipes" className="relative max-w-6xl mx-auto pb-14 px-4 scroll-mt-24">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-2xl font-bold text-white tracking-tight">Live pipes</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-slate-600/50 to-transparent" />
        </div>
        <PipelinesTable />
      </section>

      <section id="create" className="relative max-w-6xl mx-auto pb-16 px-4 scroll-mt-24">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">Create a pipe</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-slate-600/50 to-transparent" />
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="space-y-4">
            {!deployResult?.ok && (
              <form
                className="glass-card p-6 space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canCreate && !deploying) deploy();
                }}
              >
                {/* Token */}
                <div>
                  <label htmlFor="feeMint" className="block text-sm font-semibold text-white mb-1.5">Your token</label>
                  <input
                    id="feeMint"
                    aria-describedby="feeMint-hint"
                    className="glass-input font-mono text-sm"
                    value={draft.feeMint || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, feeMint: e.target.value }))}
                    placeholder="Pump.fun token mint address"
                  />
                  <p id="feeMint-hint" className="text-xs text-slate-500 mt-1.5">The token whose Pump.fun creator fees this pipeline collects.</p>
                </div>

                {/* Rules */}
                <div data-tour="rule-builder">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-white">Where the fees go</label>
                    <span className={`text-xs font-mono ${total === 100 ? "text-emerald-400" : "text-amber-400"}`}>{total}% / 100%</span>
                  </div>

                  <div className="space-y-3">
                    {rules.map((rule, i) => (
                      <div key={i} className="rounded-none border border-white/[0.05] bg-surface-900/60 p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <label htmlFor={`rule-type-${i}`} className="sr-only">Rule type for action {i + 1}</label>
                            <select
                              id={`rule-type-${i}`}
                              className="glass-input text-sm !py-2 !pr-10 appearance-none w-full !border-pink-400/50 focus:!border-pink-400/80"
                              value={rule.type}
                              onChange={(e) => updateRule(i, { type: e.target.value as RuleType })}
                            >
                              {RULE_OPTIONS.map((o) => (
                                <option key={o.type} value={o.type}>{o.label}</option>
                              ))}
                            </select>
                            <svg
                              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-400"
                              viewBox="0 0 20 20"
                              fill="none"
                            >
                              <path d="M4.5 7.5l5.5 5.5 5.5-5.5" stroke="currentColor" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          {rules.length > 1 && (
                            <button type="button" onClick={() => removeRule(i)} className="text-xs text-rose-400 hover:text-rose-300 px-2 shrink-0">
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <label htmlFor={`rule-pct-${i}`} className="sr-only">Percentage for action {i + 1}</label>
                          <input
                            id={`rule-pct-${i}`}
                            type="range"
                            min={0}
                            max={100}
                            value={rule.pct}
                            onChange={(e) => updateRule(i, { pct: Math.max(0, Math.min(100, Number(e.target.value))) })}
                            className="flex-1"
                            style={{ background: `linear-gradient(to right, #d946ef ${rule.pct}%, #1e293b ${rule.pct}%)` }}
                          />
                          <span className="w-12 text-right font-mono text-sm text-pink-300">{rule.pct}%</span>
                        </div>

                        {rule.type === "distribute" && (
                          <>
                            <label htmlFor={`rule-holderMint-${i}`} className="sr-only">Airdrop to holders of this token mint</label>
                            <input
                              id={`rule-holderMint-${i}`}
                              className="glass-input font-mono text-xs"
                              value={rule.holderMint || ""}
                              onChange={(e) => updateRule(i, { holderMint: e.target.value })}
                              placeholder="Airdrop to holders of this token mint…"
                            />
                            <label htmlFor={`rule-targetMint-${i}`} className="sr-only">Token to airdrop</label>
                            <input
                              id={`rule-targetMint-${i}`}
                              className="glass-input font-mono text-xs"
                              value={rule.targetMint || ""}
                              onChange={(e) => updateRule(i, { targetMint: e.target.value })}
                              placeholder="Token to airdrop (usually your own mint)…"
                            />
                            <div data-tour="holder-modes">
                              <div className="grid grid-cols-3 gap-1.5">
                                {HOLDER_MODES.map((m) => {
                                  const active = (rule.holderMode || "spam") === m.key;
                                  return (
                                    <button
                                      key={m.key}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() => updateRule(i, { holderMode: m.key })}
                                      className={`px-2 py-1.5 rounded-none border text-center transition-colors ${
                                        active
                                          ? "bg-pink-500/20 border-pink-400/50 text-pink-100"
                                          : "border-white/[0.06] text-slate-400 hover:border-pink-400/30 hover:text-slate-200"
                                      }`}
                                    >
                                      <div className="text-xs font-bold">{m.label}</div>
                                      <div className="text-[10px] opacity-80">{m.hint}</div>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1.5">
                                Up to {HOLDER_MODE_MAX_RECIPIENTS[rule.holderMode || "spam"]} holders share the payout equally.
                              </p>
                            </div>
                          </>
                        )}
                        {rule.type === "buy-burn" && (
                          <>
                            <label htmlFor={`rule-buyBurn-targetMint-${i}`} className="sr-only">Token mint to buy back & burn</label>
                            <input
                              id={`rule-buyBurn-targetMint-${i}`}
                              className="glass-input font-mono text-xs"
                              value={rule.targetMint || ""}
                              onChange={(e) => updateRule(i, { targetMint: e.target.value })}
                              placeholder="Token mint to buy back & burn…"
                            />
                          </>
                        )}
                        {rule.type === "send" && (
                          <>
                            <label htmlFor={`rule-send-targetWallet-${i}`} className="sr-only">Destination wallet address</label>
                            <input
                              id={`rule-send-targetWallet-${i}`}
                              className="glass-input font-mono text-xs"
                              value={rule.targetWallet || ""}
                              onChange={(e) => updateRule(i, { targetWallet: e.target.value })}
                              placeholder="Destination wallet address…"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addRule}
                    className="mt-3 w-full py-2 rounded-none border border-dashed border-pink-400/50 text-xs text-pink-300 hover:bg-pink-500/10 hover:border-pink-400/80 transition-colors"
                  >
                    + Add another
                  </button>
                  {total !== 100 && <p className="text-xs text-amber-400 mt-2">Percentages must add up to 100%.</p>}
                  {total === 100 && !rules.every(ruleComplete) && (
                    <p className="text-xs text-amber-400 mt-2">Fill in the token / wallet fields on each rule.</p>
                  )}
                </div>

                <div data-tour="drop-threshold">
                  <label htmlFor="dropThresholdSol" className="block text-xs text-slate-400 mb-1.5">SOL drop threshold (optional)</label>
                  <input
                    id="dropThresholdSol"
                    aria-describedby="dropThresholdSol-hint"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.dropThresholdSol ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, dropThresholdSol: e.target.value === "" ? undefined : Number(e.target.value) }))}
                    placeholder="0.5 (default)"
                    className="glass-input font-mono text-sm"
                  />
                  <p id="dropThresholdSol-hint" className="text-xs text-slate-500 mt-1.5">Fees accumulate until spendable SOL passes this, then a round fires.</p>
                  {rules.filter((r) => r.type === "distribute" && r.pct > 0).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {rules
                        .filter((r) => r.type === "distribute" && r.pct > 0)
                        .map((r, i) => (
                          <p key={i} className="text-[11px] text-pink-300/80 font-mono">
                            {estimateDistributePayout(r, draft.dropThresholdSol ?? 0.5, tokenInfo)}
                          </p>
                        ))}
                    </div>
                  )}
                </div>

                <div data-tour="poll-interval">
                  <label className="block text-xs text-slate-400 mb-1.5">Check interval</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {POLL_INTERVAL_PRESETS.map((p) => {
                      const active = pollIntervalKey === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setDraft((d) => ({ ...d, pollIntervalKey: p.key }))}
                          className={`px-2 py-1.5 rounded-none border text-center transition-colors ${
                            active
                              ? "bg-pink-500/20 border-pink-400/50 text-pink-100"
                              : "border-white/[0.06] text-slate-400 hover:border-pink-400/30 hover:text-slate-200"
                          }`}
                        >
                          <div className="text-xs font-bold">{p.label}</div>
                          <div className="text-[10px] opacity-80">{p.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button data-tour="create-button" className="btn-deploy w-full" type="submit" disabled={!canCreate || deploying}>
                  {deploying ? "Creating…" : "⚡ Create pipeline"}
                </button>
                {mintOk && rulesOk && !validated && (
                  <p className="text-xs text-pink-300 -mt-3">
                    Press VALIDATE in the Configuration HUD to review the exact workflow and unlock this.
                  </p>
                )}
                {deployResult && !deployResult.ok && (
                  <div className="p-3 rounded-none bg-rose-500/5 border border-rose-500/20 text-rose-300 text-xs">
                    {deployResult.error || "Create failed"}
                  </div>
                )}
              </form>
            )}

            {deployResult?.ok && !activated && (
              <div className="glass-card p-8 space-y-5">
                <div className="text-center">
                  <div className="text-5xl mb-2">🔑</div>
                  <h2 className="text-2xl font-bold text-white">One step left: set your fee receiver</h2>
                </div>
                <p className="text-slate-300 text-sm text-center">
                  The panel generated a dedicated wallet for this pipeline. On Pump.fun, set it as your token&apos;s
                  <span className="text-white font-semibold"> fee receiver</span>, then activate below.
                </p>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Your pipeline wallet (set this as the fee receiver)</label>
                  <div className="flex gap-2">
                    <code className="glass-input font-mono text-xs flex-1 break-all py-2">{deployResult.walletPublicKey}</code>
                    <button
                      aria-label="Copy pipeline wallet address to clipboard"
                      className="btn-secondary shrink-0 text-xs"
                      onClick={() => navigator.clipboard?.writeText(deployResult.walletPublicKey)}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="p-4 rounded-none bg-surface-800/60 border border-slate-700/30 text-xs text-slate-300 space-y-2">
                  <div className="flex justify-between"><span>Token</span><span className="text-white font-mono">{deployResult.feeMint?.slice(0, 8)}…</span></div>
                  <div className="flex justify-between"><span>Timing</span><span className="text-pink-300 font-mono">{POLL_INTERVAL_PRESETS.find((p) => p.key === deployResult.pollIntervalKey)?.label ?? pollIntervalPreset.label} (every {deployResult.intervalMinutes ?? pollIntervalPreset.minutes} min)</span></div>
                  <div className="flex justify-between"><span>Status</span><span className="text-amber-400">Paused — awaiting fee-receiver setup</span></div>
                </div>
                <button className="btn-deploy w-full" onClick={activate} disabled={activating}>
                  {activating ? "Verifying on-chain…" : "✓ I've set it — Activate"}
                </button>
                {activateResult && !activateResult.activated && (
                  <div className="p-3 rounded-none bg-amber-500/5 border border-amber-500/20 text-amber-300 text-xs">
                    {activateResult.error
                      ? activateResult.error
                      : activateResult.entitlement?.reason || "This wallet isn't the token's fee receiver yet. Set it on Pump.fun, then try again."}
                  </div>
                )}
                <button className="btn-secondary w-full" onClick={resetAll}>← Start New</button>
              </div>
            )}

            {activated && (
              <div className="glass-card p-8 text-center space-y-5">
                <div className="text-5xl">✅</div>
                <h2 className="text-2xl font-bold text-white">Pipeline Live</h2>
                <p className="text-slate-300 text-sm">
                  {(draft.rules || []).filter((r) => r.pct > 0).length} rule{(draft.rules || []).filter((r) => r.pct > 0).length === 1 ? "" : "s"} → checking every {deployResult.intervalMinutes ?? pollIntervalPreset.minutes} min
                </p>
                <div className="p-4 rounded-none bg-surface-800/60 border border-slate-700/30 text-xs text-slate-300 text-left space-y-2">
                  <div className="flex justify-between"><span>Job ID</span><span className="text-white font-mono">{deployResult.id?.slice(0, 8)}…</span></div>
                  <div className="flex justify-between"><span>Your share</span><span className="text-emerald-300 font-mono">{((activateResult?.entitlement?.shareBps ?? 0) / 100).toFixed(2)}%</span></div>
                  <p className="text-[10px] text-emerald-400 pt-1">It will collect creator fees, wait for the SOL threshold, then increase ATA holder count automatically.</p>
                </div>
                <button className="btn-secondary" onClick={resetAll}>← Start New</button>
              </div>
            )}
          </div>

          {/* HUD side panel — reacts to the draft the chat has extracted so far */}
          <div className="hidden lg:block sticky top-32">
            <div className="hud-panel">
              <h4 className="text-sm font-bold text-pink-300 tracking-wide mb-3">Configuration HUD</h4>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Token</span>
                  <span className={mintOk ? "text-emerald-400" : "text-amber-400"}>
                    {draft.feeMint ? `${draft.feeMint.slice(0, 6)}…` : "Not set"}
                  </span>
                </div>
                <div className="flex items-center justify-between" data-tour="wallet-hud">
                  <span className="text-slate-400">Pipeline wallet</span>
                  <span className={deployResult?.walletPublicKey ? "text-emerald-400" : "text-slate-500"}>
                    {deployResult?.walletPublicKey ? `${deployResult.walletPublicKey.slice(0, 6)}…` : "Generated on create"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Activation</span>
                  <span className={activated ? "text-emerald-400" : "text-amber-400"}>
                    {activated ? "Live" : deployResult?.ok ? "Awaiting fee receiver" : "Pending"}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-700/40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-400">Growth rules</span>
                    <span className={rulesOk ? "text-emerald-400" : "text-amber-400"}>{rulesTotal(draft.rules)}%</span>
                  </div>
                  {(draft.rules || []).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-slate-300 py-0.5">
                      <span>{RULE_LABEL[r.type]}</span>
                      <span className="font-mono text-pink-300">{r.pct}%</span>
                    </div>
                  ))}
                  {!draft.rules?.length && <p className="text-[11px] text-slate-500">No rules yet</p>}
                </div>

                <div className="pt-2 border-t border-slate-700/40">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Timing</span>
                    <span className="text-white font-mono">{pollIntervalPreset.label} (every {pollIntervalPreset.minutes} min)</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-slate-400">Drop threshold</span>
                    <span className="text-white font-mono">{draft.dropThresholdSol ?? "0.5"} SOL</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-700/40">
                  <div className="text-slate-400 mb-2">Tokens (on-chain)</div>
                  {referencedMints.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Enter a token to see live data.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {referencedMints.map((m) => {
                        const t = tokenInfo[m];
                        const label = t?.symbol ? `$${t.symbol}` : shortMint(m);
                        const initial = (label.replace("$", "")[0] || "?").toUpperCase();
                        return (
                          <span key={m} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-none bg-surface-900/70 border border-white/[0.05]">
                            {t?.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.image} alt={label} className="w-5 h-5 rounded-none object-cover border border-white/10 shrink-0" />
                            ) : (
                              <span className="w-5 h-5 rounded-none bg-gradient-to-br from-fuchsia-500/30 to-pink-500/30 border border-white/10 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
                                {initial}
                              </span>
                            )}
                            <span className="text-[11px] text-white truncate max-w-[110px]">{label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/40">
                <button
                  data-tour="validate-button"
                  onClick={validate}
                  disabled={validating}
                  className="w-full text-xs font-bold tracking-wider py-2 rounded-none border border-pink-400/20 text-white bg-gradient-to-b from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500 transition-[transform,background-color] duration-100 active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0"
                >
                  {validating ? "VALIDATING…" : "VALIDATE"}
                </button>
                {validateResult && (
                  <div
                    className={`mt-2 px-2.5 py-2 border text-[11px] leading-relaxed ${
                      validateResult.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    {validateResult.ok ? (
                      <>
                        <p className="font-semibold">This pipeline will:</p>
                        <ul className="mt-1.5 space-y-1 text-slate-200">
                          <li>· Collect Pump.fun creator fees from {tokenLabel(validateResult.feeMint, tokenInfo)} as SOL</li>
                          <li>
                            · Check every {validateResult.pollIntervalMinutes ?? pollIntervalPreset.minutes} min (
                            {POLL_INTERVAL_PRESETS.find((p) => p.key === validateResult.pollIntervalKey)?.label ?? pollIntervalPreset.label})
                          </li>
                          <li>
                            · Once spendable SOL passes{" "}
                            {((validateResult.dropThresholdLamports ?? 500_000_000) / 1e9).toString()} SOL, split it:
                          </li>
                        </ul>
                        <ul className="mt-1 ml-3 space-y-1 text-emerald-200">
                          {(validateResult.rules as ValidatedRule[]).map((r, i) => (
                            <li key={i}>· {describeRule(r, tokenInfo)}</li>
                          ))}
                        </ul>
                        {validateResult.warnings?.length > 0 && (
                          <ul className="mt-1.5 space-y-1 text-amber-300">
                            {validateResult.warnings.map((w: string, i: number) => (
                              <li key={i}>· {w}</li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 pt-2 border-t border-emerald-500/20 text-emerald-100/80 font-medium">
                          This is permanent once created — there is no edit screen. Re-check the workflow above before
                          continuing.
                        </p>
                      </>
                    ) : (
                      <p>{validateResult.error}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/40">
                <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5">
                  <span>Progress:</span>
                  <span className={activated ? "text-emerald-400" : "text-amber-400"}>{activated ? "Live" : canCreate ? "Ready to create" : "Configuring"}</span>
                </div>
                <div className="h-1.5 rounded-none bg-surface-800 overflow-hidden">
                  <div
                    className="h-full rounded-none bg-gradient-to-r from-fuchsia-500 to-pink-400 transition-all"
                    style={{
                      width: `${
                        ([mintOk, rulesOk, deployResult?.ok, activated].filter(Boolean).length / 4) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative border-t border-slate-800/60 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo className="w-7 h-7" />
            <span className="text-sm text-slate-400">
              <span className="text-slate-200 font-semibold">Wen Stimmy</span> · Automated holder growth
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-emerald-400" /> Mainnet
            </span>
            <span>Non-custodial</span>
            <span>Powered by Pump.fun fee sharing</span>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-6 text-center text-[11px] text-slate-600">
          Wen Stimmy is a branded instance of{" "}
          <a
            href="https://github.com/YATSPAT/YATSPAT"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-pink-300 transition-colors"
          >
            YATSPAT
          </a>
          , the whitelabel core.
        </div>
      </footer>
    </main>
  );
}
