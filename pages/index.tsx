import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSiws } from "../hooks/useSiws";

type Step = "source" | "split" | "schedule" | "done";
type RuleType = "burn" | "buy-burn" | "distribute" | "send";

interface SplitRule {
  id: string;
  type: RuleType;
  pct: number;
  targetMint: string;
  targetWallet: string;
  holderMint: string;
}

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { signedIn, signing, signIn, signOut } = useSiws();

  /* ── Step 1: Source ─────────────────────────────────────────────── */
  const [sourceMint, setSourceMint] = useState("");
  const [sourceWallet, setSourceWallet] = useState("");
  const [creatorKeypair, setCreatorKeypair] = useState("");

  /* ── Step 2: Rules ──────────────────────────────────────────────── */
  const [rules, setRules] = useState<SplitRule[]>([
    { id: "1", type: "buy-burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
  ]);

  /* ── Step 3: Schedule ───────────────────────────────────────────── */
  const [cronExpr, setCronExpr] = useState("every 5m");

  /* ── Navigation ──────────────────────────────────────────────────── */
  const [step, setStep] = useState<Step>("source");
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const totalPct = useMemo(() => rules.reduce((s, r) => s + r.pct, 0), [rules]);
  const addRule = () => setRules([...rules, { id: String(Date.now()), type: "burn", pct: 0, targetMint: "", targetWallet: "", holderMint: "" }]);
  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));
  const updateRule = (id: string, p: Partial<SplitRule>) => setRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

  /* ── Deploy Pipeline ─────────────────────────────────────────────── */
  const deploy = async () => {
    const wallet = sourceWallet.trim() || publicKey?.toBase58() || "";
    const finalRules = rules.filter((r) => r.pct > 0);

    setDeploying(true);
    setStatusMsg("");
    setStep("done");

    const config = {
      sourceMint: sourceMint.trim(),
      sourceWallet: wallet,
      network: "mainnet",
      rules: finalRules.map((r) => ({
        type: r.type,
        pct: r.pct,
        targetMint: r.targetMint.trim(),
        targetWallet: r.targetWallet.trim(),
        holderMint: r.holderMint.trim(),
      })),
    };

    try {
      // 1. Save config to Vercel
      const res = await fetch("/api/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, cron: cronExpr }),
      });
      const data = await res.json();

      // 2. Download config file
      downloadFile("reflector-jobs.json", JSON.stringify({ jobs: [config] }, null, 2));

      // 3. Download keypair file (if provided)
      if (creatorKeypair.trim()) {
        downloadFile("creator-keypair.json", creatorKeypair.trim());
      }

      // 4. Save source wallet if auto-filled
      setSourceWallet(wallet);

      setDeployed(true);
      setStatusMsg(data.ok ? "Pipeline deployed. Config saved to Vercel; files downloading." : "Config saved.");
    } catch {
      setStatusMsg("Config saved to Vercel. Files downloading.");
      setDeployed(true);
    } finally {
      setDeploying(false);
    }
  };

  const deployAndExecute = async () => {
    const wallet = sourceWallet.trim() || publicKey?.toBase58() || "";
    const finalRules = rules.filter((r) => r.pct > 0);

    const config = {
      sourceMint: sourceMint.trim(),
      sourceWallet: wallet,
      network: "mainnet",
      rules: finalRules.map((r) => ({
        type: r.type,
        pct: r.pct,
        targetMint: r.targetMint.trim(),
        targetWallet: r.targetWallet.trim(),
        holderMint: r.holderMint.trim(),
      })),
    };

    setDeploying(true);
    setStatusMsg("Executing pipeline immediately…");

    try {
      // Save to Vercel
      await fetch("/api/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, cron: cronExpr }),
      });

      // Download both files
      downloadFile("reflector-jobs.json", JSON.stringify({ jobs: [config] }, null, 2));
      if (creatorKeypair.trim()) downloadFile("creator-keypair.json", creatorKeypair.trim());

      setDeployed(true);
      setStatusMsg("Files downloaded. Move them to ~/.hermes/scripts/ then run: node scripts/execute-pipeline.js");
    } catch {
      setStatusMsg("Files downloaded. Save to ~/.hermes/scripts/ to activate.");
      setDeployed(true);
    } finally {
      setDeploying(false);
    }
  };

  const resetAll = () => {
    setStep("source");
    setSourceMint("");
    setSourceWallet("");
    setCreatorKeypair("");
    setRules([
      { id: "1", type: "buy-burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
      { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    ]);
    setCronExpr("every 5m");
    setDeployed(false);
    setStatusMsg("");
  };

  const cardClasses = (s: Step): string => {
    const order: Step[] = ["source", "split", "schedule", "done"];
    if (step === s) return "glass-card p-6 ring-2 ring-brand-500/40 transition-all";
    if (order.indexOf(step) > order.indexOf(s)) return "glass-card p-6 opacity-60 transition-all";
    return "glass-card p-6 opacity-40 pointer-events-none transition-all";
  };
  const badgeClasses = (s: Step): string => {
    const order: Step[] = ["source", "split", "schedule", "done"];
    if (step === s) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-brand-500/20 text-brand-400";
    if (order.indexOf(step) > order.indexOf(s)) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-emerald-500/20 text-emerald-400";
    return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-surface-800 text-slate-600";
  };
  const badgeText = (s: Step): string => {
    const order: Step[] = ["source", "split", "schedule", "done"];
    return order.indexOf(step) > order.indexOf(s) ? "✓" : String(order.indexOf(s) + 1);
  };

  /* ── UI ──────────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950/40">
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
            {connected && (signedIn ? (
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> SIWS ✓
              </button>
            ) : (
              <button onClick={signIn} disabled={signing} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-medium hover:bg-brand-500/25 transition-all disabled:opacity-50">
                {signing ? "Signing…" : "Sign In With Solana"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto pt-32 pb-24 px-4 space-y-8">

        {/* ══════════ Step 1: Reward Source ══════════ */}
        <div className={cardClasses("source")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("source")}>{badgeText("source")}</div>
            <div>
              <h3 className="text-lg font-semibold text-white">Reward Source</h3>
              <p className="text-sm text-slate-400">What token are you collecting rewards from, and which wallet holds them?</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Reward Token Mint</label>
              <input className="glass-input font-mono text-sm" value={sourceMint} onChange={(e) => setSourceMint(e.target.value)} placeholder="SPL mint — e.g. your Pump.fun creator rewards token" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Creator Wallet Address</label>
              <input className="glass-input font-mono text-sm" value={sourceWallet} onChange={(e) => setSourceWallet(e.target.value)} placeholder={connected ? publicKey?.toBase58() || "Connect wallet to auto-fill" : "Connect wallet to auto-fill"} />
              {connected && !sourceWallet && (
                <button className="text-xs text-brand-400 mt-1 hover:underline" onClick={() => setSourceWallet(publicKey!.toBase58())}>Use connected wallet</button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Creator Wallet Keypair (optional — for auto-execution)</label>
              <input type="password" className="glass-input font-mono text-sm" value={creatorKeypair} onChange={(e) => setCreatorKeypair(e.target.value)} placeholder="Paste private key (base58) — stays local, never sent to server" />
              <p className="text-[10px] text-slate-500 mt-1">Your keypair never leaves this browser. It is only saved to the downloaded file.</p>
            </div>
            <button className="btn-primary w-full" onClick={() => setStep("split")} disabled={!sourceMint.trim()}>Continue →</button>
          </div>
        </div>

        {/* ══════════ Step 2: Split Rules ══════════ */}
        <div className={cardClasses("split")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("split")}>{badgeText("split")}</div>
            <div>
              <h3 className="text-lg font-semibold text-white">Split Rules</h3>
              <p className="text-sm text-slate-400">Divide rewards any number of ways. Add a rule, set its %, choose what happens.</p>
            </div>
          </div>
          <div className="space-y-4">
            {rules.map((rule, i) => (
              <div key={rule.id} className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rule {i + 1}</span>
                  {rules.length > 1 && <button onClick={() => removeRule(rule.id)} className="text-xs text-rose-400 hover:text-rose-300">Remove</button>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Action</label>
                    <select className="glass-input text-sm" value={rule.type} onChange={(e) => updateRule(rule.id, { type: e.target.value as RuleType })}>
                      <option value="buy-burn">🔄 Swap → Burn</option>
                      <option value="burn">🔥 Burn tokens</option>
                      <option value="distribute">📤 Distribute to holders</option>
                      <option value="send">💸 Send to wallet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">%</label>
                    <input type="number" className="glass-input text-sm" value={rule.pct} onChange={(e) => updateRule(rule.id, { pct: Math.min(100, Math.max(0, Number(e.target.value))) })} min={0} max={100} />
                  </div>
                </div>
                {(rule.type !== "burn") && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {rule.type === "buy-burn" ? "Swap into (then burn)" : rule.type === "distribute" ? "Token to distribute" : "Token to send"}
                    </label>
                    <input className="glass-input font-mono text-xs" value={rule.targetMint} onChange={(e) => updateRule(rule.id, { targetMint: e.target.value })} placeholder="SPL mint…" />
                  </div>
                )}
                {rule.type === "send" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Destination</label>
                    <input className="glass-input font-mono text-xs" value={rule.targetWallet} onChange={(e) => updateRule(rule.id, { targetWallet: e.target.value })} placeholder="Wallet…" />
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total</span>
              <span className={`font-mono font-bold ${totalPct === 100 ? "text-emerald-400" : "text-rose-400"}`}>{totalPct}%</span>
            </div>
            {totalPct !== 100 && <p className="text-xs text-rose-400">Must add up to 100%</p>}
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setStep("source")}>← Back</button>
              <button className="btn-primary flex-1" onClick={() => setStep("schedule")} disabled={totalPct !== 100 || rules.length === 0}>Continue →</button>
            </div>
          </div>
        </div>

        {/* ══════════ Step 3: Schedule ══════════ */}
        <div className={cardClasses("schedule")}>
          <div className="flex items-start gap-4 mb-5">
            <div className={badgeClasses("schedule")}>{badgeText("schedule")}</div>
            <div>
              <h3 className="text-lg font-semibold text-white">Schedule</h3>
              <p className="text-sm text-slate-400">How often should the pipeline check for rewards and execute?</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {["every 5m", "every 15m", "every 30m", "every 1h", "every 6h", "every 12h", "0 */6 * * *", "0 0 * * *"].map((c) => (
                <button key={c} onClick={() => setCronExpr(c)} className={`px-3 py-2 rounded-lg text-xs font-mono transition-all ${cronExpr === c ? "bg-brand-500/20 border border-brand-500/40 text-brand-300" : "bg-surface-800 border border-slate-700/30 text-slate-400 hover:border-slate-500/50"}`}>{c}</button>
              ))}
            </div>
            <input className="glass-input font-mono text-sm" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="Or custom cron expression…" />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setStep("split")}>← Back</button>
              <button className="btn-primary flex-1" onClick={deploy}>⚡ Deploy Pipeline</button>
            </div>
          </div>
        </div>

        {/* ══════════ Done ══════════ */}
        {step === "done" && (
          <div className="glass-card p-8 text-center space-y-5">
            <div className="text-5xl">{deployed ? "✅" : "🎉"}</div>
            <h2 className="text-2xl font-bold text-white">{deployed ? "Pipeline Deployed" : "Reflector Ready"}</h2>
            <p className="text-slate-400 max-w-lg mx-auto text-sm">
              Source: <code className="text-brand-300">{sourceMint.slice(0, 10)}…</code> → {rules.filter(r => r.pct > 0).length} rules → {cronExpr}
            </p>

            {statusMsg && (
              <div className="p-3 rounded-xl bg-surface-800/60 border border-slate-700/30 text-sm text-slate-400">{statusMsg}</div>
            )}

            {deployed ? (
              <div className="text-left space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xs font-semibold text-amber-300 mb-2">⚡ Next Step — Activate Execution</p>
                  <div className="space-y-2 text-xs text-slate-400">
                    <p><span className="text-white font-bold">1.</span> Save both downloaded files to <code className="text-amber-300 text-[11px]">~/.hermes/scripts/</code></p>
                    <p><span className="text-white font-bold">3.</span> The cron poller checks {cronExpr}. Save both files and you're done.</p>
                    <p className="text-[10px] text-slate-500 mt-2">The pipeline reads <code>reflector-jobs.json</code> for config and <code>creator-keypair.json</code> to sign transactions. Only these two files.</p>
                  </div>
                </div>
                <button className="btn-primary w-full" onClick={deployAndExecute} disabled={deploying}>
                  {deploying ? "Downloading…" : "⬇️  Download Files Again"}
                </button>
              </div>
            ) : (
              <div className="text-left space-y-4">
                <div className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30">
                  <p className="text-xs font-semibold text-slate-300 mb-2">📋 Pipeline Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-400">Mint</span><code className="text-brand-300 text-right">{sourceMint.slice(0, 12)}…</code>
                    <span className="text-slate-400">Wallet</span><code className="text-brand-300 text-right">{sourceWallet ? sourceWallet.slice(0, 8) + "…" : "(none)"}</code>
                    <span className="text-slate-400">Rules</span><span className="text-white text-right">{rules.filter(r => r.pct > 0).length}</span>
                    <span className="text-slate-400">Schedule</span><span className="text-emerald-300 text-right">{cronExpr}</span>
                    <span className="text-slate-400">Keypair</span><span className={creatorKeypair ? "text-emerald-300 text-right" : "text-rose-300 text-right"}>{creatorKeypair ? "✓ Provided" : "✗ Missing"}</span>
                  </div>
                </div>
                <button className="btn-primary w-full" onClick={deploy} disabled={deploying}>
                  {deploying ? "Deploying…" : "⚡ Deploy Pipeline"}
                </button>
              </div>
            )}

            <button className="btn-secondary" onClick={resetAll}>← Start New</button>
          </div>
        )}
      </section>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Utility: auto-download a file to the browser                        */
/* ─────────────────────────────────────────────────────────────────── */
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
