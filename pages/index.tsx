import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSiws } from "../hooks/useSiws";
import { SCHEDULE_PRESETS, formatInterval } from "../lib/schedule";

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

interface HudInfo {
  crumb: string;
  title: string;
  body: string;
  example?: string;
}

const ACTION_LABEL: Record<RuleType, string> = {
  "buy-burn": "Swap → Burn",
  burn: "Burn tokens",
  distribute: "Distribute to holders",
  send: "Send to wallet",
};

const STEP_HUD: Record<Step, HudInfo> = {
  source: {
    crumb: "Reward Source",
    title: "SPL Mint Address",
    body: "Identifies the specific token type for rewards. Ensure it matches the token you wish to manage. This is often found in your project documentation or blockchain explorer.",
  },
  split: {
    crumb: "Split Rules",
    title: "Divide Your Rewards",
    body: "Each rule claims a percentage of incoming rewards and routes it to an action — burn, swap-then-burn, distribute to holders, or send to a fixed wallet. Rules must total 100%.",
  },
  schedule: {
    crumb: "Schedule",
    title: "Execution Schedule",
    body: "How often the pipeline checks for new rewards and executes your split rules. Shorter intervals react faster but run more transactions.",
  },
  done: {
    crumb: "Done",
    title: "Pipeline Status",
    body: "Your deploy result, keypair status, and next steps to get the pipeline executing on schedule.",
  },
};

function ruleHud(rule: SplitRule, field: "type" | "pct" | "target", index: number): HudInfo {
  const crumb = `Split Rules → Rule ${index + 1} → ${field === "type" ? "Action" : field === "pct" ? "Allocation" : ACTION_LABEL[rule.type]}`;
  if (field === "pct") {
    return {
      crumb,
      title: "Allocation %",
      body: `This rule currently claims ${rule.pct}% of incoming rewards. All rules together must total exactly 100%.`,
    };
  }
  if (field === "type") {
    return {
      crumb,
      title: "Rule Action",
      body: `Currently set to "${ACTION_LABEL[rule.type]}". Choose how this share of rewards is handled once collected.`,
    };
  }
  if (rule.type === "buy-burn") {
    return {
      crumb,
      title: "Swap Into (then burn)",
      body: "This field specifies the SPL token mint address that the source token will be swapped into before being burned. The burning mechanism permanently removes tokens from circulation.",
      example: "e.g. USDC, SOL, or another SPL token mint address.",
    };
  }
  if (rule.type === "distribute") {
    return {
      crumb,
      title: "Snapshot Holders Of",
      body: "Rewards are split proportionally across every wallet holding this token at execution time.",
      example: "e.g. your project's main token mint.",
    };
  }
  if (rule.type === "send") {
    return {
      crumb,
      title: "Destination Wallet",
      body: "A fixed wallet address that receives this rule's share of rewards every cycle.",
    };
  }
  return STEP_HUD.split;
}

const FIELD_HUD: Record<string, HudInfo> = {
  "source.wallet": {
    crumb: "Reward Source → Creator Wallet",
    title: "Creator Wallet Address",
    body: "The wallet that currently receives raw reward tokens before the pipeline redirects them. Auto-fills from your connected wallet.",
  },
  "source.keypair": {
    crumb: "Reward Source → Creator Keypair",
    title: "Auto-Execution Keypair",
    body: "Encrypted (AES-256-GCM) before it's stored, decrypted only in memory at execution time. Use a dedicated throwaway wallet funded only with what this pipeline needs to move — never your main wallet.",
  },
  "schedule.cron": {
    crumb: "Schedule → Interval",
    title: "Execution Schedule",
    body: "How often the pipeline checks for new rewards and executes your split rules.",
    example: "Presets range from every 5 minutes to daily.",
  },
};

function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="reflector-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d946ef" />
          <stop offset="55%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#reflector-logo-grad)" opacity="0.18" />
      <path d="M13 9h9.5a6.5 6.5 0 0 1 3 12.3L31 31h-5.4l-4.7-8.7H17V31h-4V9Zm4 3.4v6.4h5.3a3.2 3.2 0 0 0 0-6.4H17Z" fill="url(#reflector-logo-grad)" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`w-5 h-5 shrink-0 text-slate-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircuitBackground() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.5]"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMaxYMid slice"
    >
      <defs>
        <pattern id="circuit-dots" width="46" height="46" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.4" fill="#22d3ee" opacity="0.7" />
          <path d="M1 1 L1 23 L23 23 L23 45" stroke="#22d3ee" strokeWidth="0.6" opacity="0.32" fill="none" />
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

export default function Home() {
  const { publicKey, connected } = useWallet();
  const { signedIn, signing, signIn, signOut } = useSiws();

  const [step, setStep] = useState<Step>("source");
  const [manualOpen, setManualOpen] = useState<Set<Step>>(new Set());
  const [hud, setHud] = useState<HudInfo>(STEP_HUD.source);

  const [sourceMint, setSourceMint] = useState("");
  const [sourceWallet, setSourceWallet] = useState("");
  const [creatorKeypair, setCreatorKeypair] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);

  const [rules, setRules] = useState<SplitRule[]>([
    { id: "1", type: "buy-burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
  ]);

  const totalPct = useMemo(() => rules.reduce((s, r) => s + r.pct, 0), [rules]);
  const addRule = () => setRules([...rules, { id: String(Date.now()), type: "burn", pct: 0, targetMint: "", targetWallet: "", holderMint: "" }]);
  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));
  const updateRule = (id: string, p: Partial<SplitRule>) => setRules(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const STEP_ORDER: Step[] = ["source", "split", "schedule"];
  const isOpen = (s: Step) => s === step || manualOpen.has(s);
  const canReach = (s: Step) => STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(step);
  const toggleStep = (s: Step) => {
    if (s === step || !canReach(s)) return;
    setManualOpen((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };
  const goToStep = (s: Step) => {
    setStep(s);
    setHud(STEP_HUD[s]);
  };

  /* ── Deploy: one call. Stored server-side (encrypted), runs on schedule forever — nothing else to do. ── */
  const deploy = async () => {
    const wallet = sourceWallet.trim() || publicKey?.toBase58() || "";
    setDeploying(true);

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMint: sourceMint.trim(),
          sourceWallet: wallet,
          rules: rules.filter(r => r.pct > 0).map(r => ({
            type: r.type, pct: r.pct,
            targetMint: r.targetMint.trim(),
            targetWallet: r.targetWallet.trim(),
            holderMint: r.holderMint.trim(),
          })),
          cron: intervalMinutes,
          keypair: creatorKeypair.trim() || undefined,
          ownerAddress: signedIn ? publicKey?.toBase58() : undefined,
        }),
      });
      const data = await res.json();

      setSourceWallet(wallet);
      setDeployResult(data);
      goToStep("done");
    } catch (err: any) {
      setDeployResult({ ok: false, error: err.message });
      goToStep("done");
    } finally {
      setDeploying(false);
    }
  };

  const resetAll = () => {
    goToStep("source");
    setManualOpen(new Set());
    setSourceMint("");
    setSourceWallet("");
    setCreatorKeypair("");
    setRules([
      { id: "1", type: "buy-burn", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
      { id: "2", type: "distribute", pct: 50, targetMint: "", targetWallet: "", holderMint: "" },
    ]);
    setIntervalMinutes(60);
    setDeployResult(null);
  };

  const badgeClasses = (s: Step) => {
    const order: Step[] = ["source", "split", "schedule"];
    if (step === s) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/40";
    if (order.indexOf(step) > order.indexOf(s)) return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-cyan-500/20 text-cyan-300";
    return "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-surface-800 text-slate-600";
  };
  const badgeText = (s: Step) => {
    const order: Step[] = ["source", "split", "schedule"];
    return order.indexOf(step) > order.indexOf(s) ? "✓" : String(order.indexOf(s) + 1);
  };
  const cardClasses = (s: Step) => {
    if (step === s) return "glass-card p-6 ring-2 ring-cyan-400/40 transition-all";
    if (!canReach(s)) return "glass-card p-6 opacity-40 pointer-events-none transition-all";
    return "glass-card p-6 opacity-80 transition-all";
  };

  return (
    <main className="relative min-h-screen bg-gradient-to-br from-surface-900 via-surface-900 to-purple-900/40 overflow-hidden">
      <CircuitBackground />

      <header className="fixed top-0 inset-x-0 z-50 glass-card rounded-none border-b border-slate-700/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white tracking-tight">Wen Stimmy?</h1>
              <p className="text-xs text-slate-300 flex items-center gap-2">
                <span className="hidden sm:inline">Reflection Token Panel</span>
                <span className="px-1.5 py-px rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] uppercase tracking-wider">MAINNET</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <WalletMultiButton style={{ background: connected ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #a21caf, #22d3ee)", borderRadius: "0.75rem", height: "2.5rem", fontSize: "0.8rem", padding: "0 0.85rem", whiteSpace: "nowrap" }} />
            {connected && (signedIn ? (
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> SIWS ✓
              </button>
            ) : (
              <button onClick={signIn} disabled={signing} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition-all disabled:opacity-50">
                {signing ? "Signing…" : "Sign In With Solana"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="relative max-w-6xl mx-auto pt-32 pb-40 px-4">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-8 max-w-xl">
          Automated Reward Pipeline Deployment
        </h2>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-4">

            {/* Step 1 */}
            <div className={cardClasses("source")}>
              <button type="button" className="accordion-header" onClick={() => toggleStep("source")}>
                <div className={badgeClasses("source")}>{badgeText("source")}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">1. Reward Source</h3>
                  <p className="text-sm text-slate-300">What token are you collecting rewards from, and which wallet holds them?</p>
                </div>
                {step !== "source" && <Chevron open={isOpen("source")} />}
              </button>
              {isOpen("source") && (
                <div className="space-y-4 mt-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Reward Token Mint</label>
                    <input
                      className="glass-input font-mono text-sm"
                      value={sourceMint}
                      onFocus={() => setHud(STEP_HUD.source)}
                      onChange={(e) => setSourceMint(e.target.value)}
                      placeholder="SPL mint — e.g. your Pump.fun creator rewards token"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Creator Wallet Address</label>
                    <input
                      className="glass-input font-mono text-sm"
                      value={sourceWallet}
                      onFocus={() => setHud(FIELD_HUD["source.wallet"])}
                      onChange={(e) => setSourceWallet(e.target.value)}
                      placeholder={connected ? publicKey?.toBase58() || "Connect wallet to auto-fill" : "Connect wallet to auto-fill"}
                    />
                    {connected && !sourceWallet && (
                      <button className="text-xs text-cyan-400 mt-1 hover:underline" onClick={() => setSourceWallet(publicKey!.toBase58())}>Use connected wallet</button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Creator Wallet Keypair</label>
                    <input
                      type="password"
                      className="glass-input font-mono text-sm"
                      value={creatorKeypair}
                      onFocus={() => setHud(FIELD_HUD["source.keypair"])}
                      onChange={(e) => setCreatorKeypair(e.target.value)}
                      placeholder="Paste private key (base58) for auto-execution"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Encrypted at rest, decrypted only in memory when the pipeline runs. Use a dedicated throwaway wallet — never your main one.</p>
                  </div>
                  <button className="btn-primary w-full" onClick={() => goToStep("split")} disabled={!sourceMint.trim()}>Continue →</button>
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div className={cardClasses("split")}>
              <button type="button" className="accordion-header" onClick={() => toggleStep("split")}>
                <div className={badgeClasses("split")}>{badgeText("split")}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">2. Split Rules</h3>
                  <p className="text-sm text-slate-300">Divide rewards any number of ways.</p>
                </div>
                {step !== "split" && <Chevron open={isOpen("split")} />}
              </button>
              {isOpen("split") && (
                <div className="space-y-4 mt-5">
                  {rules.map((rule, i) => (
                    <div key={rule.id} className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Rule {i + 1}</span>
                        {rules.length > 1 && <button onClick={() => removeRule(rule.id)} className="text-xs text-rose-400 hover:text-rose-300">Remove</button>}
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={rule.pct}
                          onFocus={() => setHud(ruleHud(rule, "pct", i))}
                          onChange={(e) => updateRule(rule.id, { pct: Math.min(100, Math.max(0, Number(e.target.value))) })}
                          className="flex-1"
                          style={{ background: `linear-gradient(to right, #d946ef ${rule.pct}%, #1e293b ${rule.pct}%)` }}
                        />
                        <span className="w-12 text-right font-mono text-sm text-cyan-300">{rule.pct}%</span>
                        <select
                          className="glass-input text-sm w-auto"
                          value={rule.type}
                          onFocus={() => setHud(ruleHud(rule, "type", i))}
                          onChange={(e) => updateRule(rule.id, { type: e.target.value as RuleType })}
                        >
                          <option value="buy-burn">🔄 Swap → Burn</option>
                          <option value="burn">🔥 Burn tokens</option>
                          <option value="distribute">📤 Distribute to holders</option>
                          <option value="send">💸 Send to wallet</option>
                        </select>
                      </div>
                      {(rule.type !== "burn") && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            {rule.type === "buy-burn" ? "Swap into (then burn)" : rule.type === "distribute" ? "Token to distribute" : "Token to send"}
                          </label>
                          <input
                            className="glass-input font-mono text-xs"
                            value={rule.targetMint}
                            onFocus={() => setHud(ruleHud(rule, "target", i))}
                            onChange={(e) => updateRule(rule.id, { targetMint: e.target.value })}
                            placeholder="SPL mint…"
                          />
                        </div>
                      )}
                      {rule.type === "send" && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Destination</label>
                          <input
                            className="glass-input font-mono text-xs"
                            value={rule.targetWallet}
                            onFocus={() => setHud(ruleHud(rule, "target", i))}
                            onChange={(e) => updateRule(rule.id, { targetWallet: e.target.value })}
                            placeholder="Wallet…"
                          />
                        </div>
                      )}
                      {rule.type === "distribute" && (
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Snapshot holders of</label>
                          <input
                            className="glass-input font-mono text-xs"
                            value={rule.holderMint}
                            onFocus={() => setHud(ruleHud(rule, "target", i))}
                            onChange={(e) => updateRule(rule.id, { holderMint: e.target.value })}
                            placeholder="Token mint whose holders receive…"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={addRule} className="w-full py-2 rounded-xl border border-dashed border-slate-600/50 text-xs text-slate-500 hover:border-cyan-400/40 hover:text-cyan-400 transition-all">+ Add Rule</button>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-300">Total</span>
                      <span className={`font-mono font-bold ${totalPct === 100 ? "text-emerald-400" : "text-rose-400"}`}>{totalPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${totalPct === 100 ? "bg-gradient-to-r from-fuchsia-500 to-cyan-400" : "bg-rose-500/70"}`}
                        style={{ width: `${Math.min(100, totalPct)}%` }}
                      />
                    </div>
                    {totalPct !== 100 && <p className="text-xs text-rose-400 mt-1.5">Must add up to 100%</p>}
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" onClick={() => goToStep("source")}>← Back</button>
                    <button className="btn-primary flex-1" onClick={() => goToStep("schedule")} disabled={totalPct !== 100 || rules.length === 0}>Continue →</button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className={cardClasses("schedule")}>
              <button type="button" className="accordion-header" onClick={() => toggleStep("schedule")}>
                <div className={badgeClasses("schedule")}>{badgeText("schedule")}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white">3. Schedule</h3>
                  <p className="text-sm text-slate-300">How often should the pipeline check for rewards and execute?</p>
                </div>
                {step !== "schedule" && <Chevron open={isOpen("schedule")} />}
              </button>
              {isOpen("schedule") && (
                <div className="space-y-4 mt-5">
                  <div className="grid grid-cols-4 gap-2">
                    {SCHEDULE_PRESETS.map((p) => (
                      <button
                        key={p.minutes}
                        onClick={() => setIntervalMinutes(p.minutes)}
                        onFocus={() => setHud(FIELD_HUD["schedule.cron"])}
                        className={`px-3 py-2 rounded-lg text-xs font-mono transition-all ${intervalMinutes === p.minutes ? "bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-300" : "bg-surface-800 border border-slate-700/30 text-slate-300 hover:border-slate-500/50"}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button className="btn-secondary w-full" onClick={() => goToStep("split")}>← Back</button>
                </div>
              )}
            </div>

            {/* Done */}
            {step === "done" && (
              <div className="glass-card p-8 text-center space-y-5">
                <div className="text-5xl">{deployResult?.ok ? "✅" : "❌"}</div>
                <h2 className="text-2xl font-bold text-white">
                  {deployResult?.ok ? "Pipeline Live" : "Deploy Failed"}
                </h2>
                <p className="text-slate-300 text-sm">
                  <code className="text-cyan-300">{sourceMint.slice(0, 10)}…</code> → {rules.filter(r => r.pct > 0).length} rules → every {formatInterval(intervalMinutes)}
                </p>

                {deployResult?.message && (
                  <div className={`p-3 rounded-xl text-sm ${deployResult.ok ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-300" : "bg-rose-500/5 border border-rose-500/20 text-rose-300"}`}>
                    {deployResult.message}
                  </div>
                )}

                {deployResult?.ok && (
                  <div className="p-4 rounded-xl bg-surface-800/60 border border-slate-700/30 text-xs text-slate-300 text-left space-y-2">
                    <div className="flex justify-between"><span>Pipeline ID</span><span className="text-white font-mono">{deployResult.id?.slice(0, 8)}…</span></div>
                    <div className="flex justify-between"><span>Rules</span><span className="text-white">{rules.filter(r => r.pct > 0).length}</span></div>
                    <div className="flex justify-between"><span>Schedule</span><span className="text-cyan-300 font-mono">every {formatInterval(intervalMinutes)}</span></div>
                    <p className="text-[10px] text-emerald-400 pt-1">Nothing else to do — it runs automatically from here on.</p>
                  </div>
                )}

                <button className="btn-secondary" onClick={resetAll}>← Start New</button>
              </div>
            )}
          </div>

          {/* HUD side panel */}
          <div className="hidden lg:block sticky top-32">
            <div className="hud-panel">
              <h4 className="text-sm font-bold text-cyan-300 tracking-wide mb-3">Pipeline HUD — Technical Details</h4>
              <p className="text-[11px] font-mono text-slate-500 mb-3 leading-relaxed">{hud.crumb}</p>
              <p className="text-sm font-semibold text-white mb-1.5">{hud.title}</p>
              <p className="text-xs text-slate-300 leading-relaxed">{hud.body}</p>
              {hud.example && (
                <p className="text-xs text-cyan-300/80 mt-2 leading-relaxed">{hud.example}</p>
              )}
              <div className="mt-4 pt-3 border-t border-slate-700/40">
                <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5">
                  <span>Validation Status:</span>
                  <span className={totalPct === 100 || step !== "split" ? "text-emerald-400" : "text-amber-400"}>
                    {totalPct === 100 || step !== "split" ? "Live" : "Pending"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400" style={{ width: `${((STEP_ORDER.indexOf(step === "done" ? "schedule" : step) + 1) / STEP_ORDER.length) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {step !== "done" && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-t from-surface-900 via-surface-900/95 to-transparent pt-8 pb-5 px-4">
          <div className="max-w-6xl mx-auto lg:pr-[344px]">
            <button className="btn-deploy w-full" onClick={deploy} disabled={step !== "schedule" || deploying}>
              {deploying ? "Deploying…" : "⚡ Deploy Pipeline"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
