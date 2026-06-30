import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSiws } from "../hooks/useSiws";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Step = "source" | "split" | "schedule" | "done";

type RuleType = "burn" | "buy-burn" | "distribute" | "send";

interface SplitRule {
  id: string;
  type: RuleType;
  pct: number;
  /** Target mint for swap operations (burn, buy-burn, distribute) */
  targetMint: string;
  /** Destination wallet for send / distribution */
  targetWallet: string;
  /** Mint of the holders to snapshot (distribute only) */
  holderMint: string;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { signedIn, signing, signIn, signOut } = useSiws();



  /* ── Step 1: Source ─────────────────────────────────────────────── */
  const [sourceMint, setSourceMint] = useState("");
  const [sourceWallet, setSourceWallet] = useState("");

  /* ── Step 2: Split rules ────────────────────────────────────────── */
  const [rules, setRules] = useState<SplitRule[]>([
    { id: "1", type: "burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
  ]);

  /* ── Step 3: Schedule ───────────────────────────────────────────── */
  const [cronExpr, setCronExpr] = useState("every 30m");

  /* ── Navigation ──────────────────────────────────────────────────── */
  const [step, setStep] = useState<Step>("source");
  const [error, setError] = useState("");
  const [generatedSnippet, setGeneratedSnippet] = useState("");
  const [compactSnippet, setCompactSnippet] = useState("");

  const totalPct = useMemo(() => rules.reduce((s, r) => s + r.pct, 0), [rules]);

  const addRule = () => {
    setRules([...rules, { id: String(Date.now()), type: "burn", pct: 0, targetMint: "", targetWallet: "", holderMint: "" }]);
  };

  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));

  const updateRule = (id: string, patch: Partial<SplitRule>) =>
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  /* ── Generate cron snippet ───────────────────────────────────────── */
  const generateJob = () => {
    const wallet = sourceWallet.trim() || publicKey?.toBase58() || "";
    const input = {
      sourceMint: sourceMint.trim(),
      sourceWallet: wallet,
      network: "mainnet",
      rules: rules.filter((r) => r.pct > 0).map((r) => ({
        type: r.type,
        pct: r.pct,
        targetMint: r.targetMint.trim(),
        targetWallet: r.targetWallet.trim(),
        holderMint: r.holderMint.trim(),
      })),
    };

    const formatted = JSON.stringify(input, null, 2);
    const compact = JSON.stringify(input);
    setGeneratedSnippet(formatted);
    setCompactSnippet(compact);
    setSourceWallet(wallet); // persist auto-filled wallet
    setStep("done");

    // POST to /api/auto-config for the poller
    fetch("/api/auto-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, cron: cronExpr, label: `Reflector — ${sourceMint.slice(0, 8)}…` }),
    }).catch(() => {});
  };

  const resetAll = () => {
    setStep("source");
    setSourceMint("");
    setSourceWallet("");
    setRules([
      { id: "1", type: "burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
      { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    ]);
    setCronExpr("every 30m");
    setError("");
    setGeneratedSnippet("");
    setCompactSnippet("");
  };

  const cardClasses = (s: Step): string => {
    if (step === s) return "glass-card p-6 ring-2 ring-brand-500/40 transition-all";
    const stepOrder: Step[] = ["source", "split", "schedule", "done"];
    if (stepOrder.indexOf(step) > stepOrder.indexOf(s)) return "glass-card p-6 opacity-60 transition-all";
    return "glass-card p-6 opacity-40 pointer-events-none transition-all";
  };
  const badgeClasses = (s: Step): string => {
    const stepOrder: Step[] = ["source", "split", "schedule", "done"];
    if (step === s) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-brand-500/20 text-brand-400";
    if (stepOrder.indexOf(step) > stepOrder.indexOf(s)) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-emerald-500/20 text-emerald-400";
    return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-surface-800 text-slate-600";
  };
  const badgeText = (s: Step): string => {
    const stepOrder: Step[] = ["source", "split", "schedule", "done"];
    return stepOrder.indexOf(step) > stepOrder.indexOf(s) ? "✓" : String(stepOrder.indexOf(s) + 1);
  };
  const ruleTypeLabel = (t: RuleType): string => {
    switch (t) {
      case "burn": return "🔥 Burn my token";
      case "buy-burn": return "🔄 Swap → burn";
      case "distribute": return "📤 Distribute to holders";
      case "send": return "💸 Send to wallet";
    }
  };

  /* ── UI ──────────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950/40">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 glass-card rounded-none border-b border-slate-700/30">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-xl shadow-lg shadow-brand-500/30">⟡</div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Reflector</h1>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                Reflection Token Panel
                <span className="px-1.5 py-px rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] uppercase tracking-wider">MAINNET</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WalletMultiButton style={{ background: connected ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #4f46e5, #6366f1)", borderRadius: "0.75rem", height: "2.5rem", fontSize: "0.875rem", padding: "0 1rem" }} />
            {connected && (
              signedIn ? (
                <button onClick={signOut} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> SIWS ✓
                </button>
              ) : (
                <button onClick={signIn} disabled={signing} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-medium hover:bg-brand-500/25 transition-all disabled:opacity-50">
                  {signing ? "Signing…" : "Sign In With Solana"}
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto pt-32 pb-24 px-4 space-y-8">
        {/* ══════════ Step 1: Reward Source ══════════ */}
        <div className={cardClasses("source")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("source")}>
              {badgeText("source")}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Reward Source</h3>
              <p className="text-sm text-slate-400">What token are you collecting rewards FROM? This is the PumpFun token or fee token that accumulates. Optionally, which wallet holds them.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Reward Token Mint</label>
              <input className="glass-input font-mono text-sm" value={sourceMint} onChange={(e) => setSourceMint(e.target.value)} placeholder="Paste the SPL token mint…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Wallet Holding Rewards</label>
              <input className="glass-input font-mono text-sm" value={sourceWallet} onChange={(e) => setSourceWallet(e.target.value)} placeholder={connected ? publicKey?.toBase58() || "Connect wallet first" : "Connect wallet to auto-fill"} />
              {connected && !sourceWallet && (
                <button className="text-xs text-brand-400 mt-1 hover:underline" onClick={() => setSourceWallet(publicKey!.toBase58())}>Use connected wallet</button>
              )}
              <p className="text-[10px] text-slate-500 mt-1">The cron poller checks this wallet's balance. Connect wallet to auto-fill.</p>
            </div>
            <button className="btn-primary w-full" onClick={() => setStep("split")} disabled={!sourceMint.trim()}>Continue to Split Rules →</button>
          </div>
        </div>

        {/* ══════════ Step 2: Split Rules ══════════ */}
        <div className={cardClasses("split")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("split")}>
              {badgeText("split")}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Split Rules</h3>
              <p className="text-sm text-slate-400">Divide your rewards any number of ways. Swap → burn, buy → distribute, send to treasury — each rule gets a % cut.</p>
            </div>
          </div>

          <div className="space-y-4">
            {rules.map((rule, i) => (
              <div key={rule.id} className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rule {i + 1}</span>
                  {rules.length > 1 && (
                    <button onClick={() => removeRule(rule.id)} className="text-xs text-rose-400 hover:text-rose-300">Remove</button>
                  )}
                </div>

                {/* Rule type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Rule Type</label>
                    <select className="glass-input text-sm" value={rule.type} onChange={(e) => updateRule(rule.id, { type: e.target.value as RuleType })}>
                      <option value="burn">🔥 Burn my token</option>
                      <option value="buy-burn">🔄 Swap → burn</option>
                      <option value="distribute">📤 Distribute to holders</option>
                      <option value="send">💸 Send to wallet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Split %</label>
                    <input type="number" className="glass-input text-sm" value={rule.pct} onChange={(e) => updateRule(rule.id, { pct: Math.min(100, Math.max(0, Number(e.target.value))) })} min={0} max={100} />
                  </div>
                </div>

                {/* Conditional fields */}
                {rule.type !== "burn" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {rule.type === "buy-burn" ? "Token to swap to & burn" : rule.type === "distribute" ? "Token to distribute" : "Token to send"}
                    </label>
                    <input className="glass-input font-mono text-xs" value={rule.targetMint} onChange={(e) => updateRule(rule.id, { targetMint: e.target.value })} placeholder="SPL mint…" />
                  </div>
                )}

                {rule.type === "send" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Destination Wallet</label>
                    <input className="glass-input font-mono text-xs" value={rule.targetWallet} onChange={(e) => updateRule(rule.id, { targetWallet: e.target.value })} placeholder="Recipient wallet…" />
                  </div>
                )}

                {rule.type === "distribute" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Snapshot holders of</label>
                    <input className="glass-input font-mono text-xs" value={rule.holderMint} onChange={(e) => updateRule(rule.id, { holderMint: e.target.value })} placeholder="Token mint whose holders receive…" />
                  </div>
                )}
              </div>
            ))}

            <button onClick={addRule} className="w-full py-2 rounded-xl border border-dashed border-slate-600/50 text-xs text-slate-500 hover:border-brand-500/40 hover:text-brand-400 transition-all">+ Add Rule</button>

            {/* Total check */}
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total</span>
              <span className={`font-mono font-bold ${totalPct === 100 ? "text-emerald-400" : "text-rose-400"}`}>{totalPct}%</span>
            </div>
            {totalPct !== 100 && <p className="text-xs text-rose-400">Must add up to 100%</p>}

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setStep("source")}>← Back</button>
              <button className="btn-primary flex-1" onClick={() => setStep("schedule")} disabled={totalPct !== 100 || rules.length === 0}>Continue to Schedule →</button>
            </div>
          </div>
        </div>

        {/* ══════════ Step 3: Schedule ══════════ */}
        <div className={cardClasses("schedule")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("schedule")}>
              {badgeText("schedule")}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Schedule</h3>
              <p className="text-sm text-slate-400">How often should Reflector check rewards and run the splits?</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Run every</label>
              <div className="grid grid-cols-4 gap-2">
                {["every 5m", "every 15m", "every 30m", "every 1h", "every 6h", "every 12h", "0 */6 * * *", "0 0 * * *"].map((c) => (
                  <button key={c} onClick={() => setCronExpr(c)} className={`px-3 py-2 rounded-lg text-xs font-mono transition-all ${cronExpr === c ? "bg-brand-500/20 border border-brand-500/40 text-brand-300" : "bg-surface-800 border border-slate-700/30 text-slate-400 hover:border-slate-500/50"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <input className="glass-input font-mono text-sm mt-3" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="Or type your own cron expression…" />
            </div>

            {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>}

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setStep("split")}>← Back</button>
              <button className="btn-primary flex-1" onClick={generateJob}>⚡ Generate Job</button>
            </div>
          </div>
        </div>

        {/* ══════════ Done ══════════ */}
        {step === "done" && (
          <div className="glass-card p-8 text-center space-y-5">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl font-bold text-white">Reflector Job Ready</h2>
            <p className="text-slate-400 max-w-md mx-auto text-sm">
              Source: <code className="text-brand-300">{sourceMint.slice(0, 8)}…</code> → {rules.length} rules → every {cronExpr}
            </p>

            <div className="text-left space-y-4">
              <div className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30">
                <p className="text-xs font-semibold text-slate-300 mb-2">📋 Job Config</p>
                <pre className="bg-surface-950 border border-slate-700/50 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-64">{generatedSnippet}</pre>
                <CopyButton text={generatedSnippet} />
              </div>

              <div className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30">
                <p className="text-xs font-semibold text-slate-300 mb-2">⏱️ Hermes Cron Command</p>
                <p className="text-xs text-slate-500 mb-2">Paste this to run once, or save to <code className="text-amber-300">~/.hermes/scripts/reflector-jobs.json</code> for the cron poller:</p>
                <pre className="bg-surface-950 border border-slate-700/50 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
{`curl -s -X POST https://reflector-panel.vercel.app/api/reflect \\
  -H "Content-Type: application/json" \\
  -d '${compactSnippet}'`}
                </pre>
                <CopyButton text={`curl -s -X POST https://reflector-panel.vercel.app/api/reflect -H "Content-Type: application/json" -d '${compactSnippet}'`} />
              </div>
            </div>

            <button className="btn-secondary" onClick={resetAll}>← Start New</button>
          </div>
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Copy button                                                        */
/* ─────────────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-brand-600/30 border border-brand-500/30 text-brand-300 text-[11px] font-medium hover:bg-brand-600/50 transition-all"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
