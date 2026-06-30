import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSiws } from "../hooks/useSiws";

/* ------------------------------------------------------------------ */
/*  TypeScript types                                                  */
/* ------------------------------------------------------------------ */
interface Holder {
  address: string;
  balance: number;
  percentage: number;
}

type Step = "snapshot" | "rewards" | "burn" | "distribute" | "done";

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */
export default function Home() {
  const { publicKey, connected } = useWallet();
  const { signedIn, signing, signIn, signOut, siwsAddress } = useSiws();

  // ── Auto‑distribute state ──────────────────────────────────────────
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoWallet, setAutoWallet] = useState("");
  const [autoRewardMint, setAutoRewardMint] = useState("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const [autoThreshold, setAutoThreshold] = useState(100);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoSnippet, setAutoSnippet] = useState("");

  /* ---------- state ---------- */
  const [step, setStep] = useState<Step>("snapshot");
  const [tokenAddress, setTokenAddress] = useState("");
  const [snapshotHolders, setSnapshotHolders] = useState<Holder[]>([]);
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Rewards
  const [rewardAmount, setRewardAmount] = useState(1000);
  const [extraFeePercent, setExtraFeePercent] = useState(1);
  const [rewardsCollected, setRewardsCollected] = useState(false);

  // Burn
  const [burnPercent, setBurnPercent] = useState(1);
  const [burnComplete, setBurnComplete] = useState(false);

  // Sliders for excluding holders
  const [excludeTop, setExcludeTop] = useState(0);
  const [excludeBottom, setExcludeBottom] = useState(0);
  const [distributionDone, setDistributionDone] = useState(false);

  /* ---------- filtered holders (after exclusions) ---------- */
  const eligibleHolders = useMemo(() => {
    const sorted = [...snapshotHolders].sort((a, b) => b.balance - a.balance);
    const n = sorted.length;
    const topCut = Math.floor(n * (excludeTop / 100));
    const bottomCut = Math.floor(n * (excludeBottom / 100));
    const slice = sorted.slice(topCut, n - bottomCut);
    const totalBalance = slice.reduce((s, h) => s + h.balance, 0);
    return slice.map((h) => ({
      ...h,
      percentage: totalBalance > 0 ? (h.balance / totalBalance) * 100 : 0,
    }));
  }, [snapshotHolders, excludeTop, excludeBottom]);

  const totalExcluded = snapshotHolders.length - eligibleHolders.length;

  /* ---------- distribution amounts ---------- */
  const afterFee = useMemo(
    () => rewardAmount * (1 - extraFeePercent / 100),
    [rewardAmount, extraFeePercent]
  );
  const afterBurn = useMemo(
    () => afterFee * (1 - burnPercent / 100),
    [afterFee, burnPercent]
  );

  const distribution = useMemo(
    () =>
      eligibleHolders.map((h) => ({
        ...h,
        receive: afterBurn * (h.percentage / 100),
      })),
    [eligibleHolders, afterBurn]
  );

  /* ---------- handlers ---------- */
  const takeSnapshot = async () => {
    if (!tokenAddress.trim()) {
      setError("Please enter a token mint address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/holders?mint=${encodeURIComponent(tokenAddress.trim())}&network=mainnet`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch holders");
      setSnapshotHolders(data.holders);
      setSnapshotTaken(true);
      setStep("rewards");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch holders");
    } finally {
      setLoading(false);
    }
  };

  const collectRewards = () => {
    setRewardsCollected(true);
    setStep("burn");
  };

  const executeBurn = () => {
    setBurnComplete(true);
    setStep("distribute");
  };

  const executeDistribution = () => {
    setDistributionDone(true);
    setStep("done");
  };

  const resetAll = () => {
    setStep("snapshot");
    setSnapshotTaken(false);
    setRewardsCollected(false);
    setBurnComplete(false);
    setDistributionDone(false);
    setSnapshotHolders([]);
    setError("");
  };

  const saveAutoConfig = async () => {
    setAutoSaving(true);
    setAutoSaved(false);
    try {
      const config = {
        enabled: autoEnabled,
        label: `Auto Reflect — ${tokenAddress.slice(0, 8)}…`,
        monitor_wallet: autoWallet.trim(),
        reward_mint: autoRewardMint.trim(),
        target_mint: tokenAddress.trim(),
        threshold_ui: autoThreshold,
        reward_amount: rewardAmount,
        fee_percent: extraFeePercent,
        burn_percent: burnPercent,
        exclude_top: excludeTop,
        exclude_bottom: excludeBottom,
      };
      const res = await fetch("/api/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setAutoSaved(true);
      if (data.snippet) setAutoSnippet(data.snippet);
      setTimeout(() => setAutoSaved(false), 3000);
    } catch {
      setError("Failed to save auto-distribute config");
    } finally {
      setAutoSaving(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <main className="min-h-screen bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950/40">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 glass-card rounded-none border-b border-slate-700/30">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-xl shadow-lg shadow-brand-500/30">
              ⟡
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Reflector
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                Reflection Token Panel
                <span className="px-1.5 py-px rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] uppercase tracking-wider">MAINNET</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StepsIndicator step={step} />
            <WalletMultiButton
              style={{
                background: connected
                  ? "linear-gradient(135deg, #059669, #10b981)"
                  : "linear-gradient(135deg, #4f46e5, #6366f1)",
                borderRadius: "0.75rem",
                height: "2.5rem",
                fontSize: "0.875rem",
                padding: "0 1rem",
              }}
            />
            {connected && (
              signedIn ? (
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all"
                  title="Signed in as this wallet"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  SIWS ✓
                </button>
              ) : (
                <button
                  onClick={signIn}
                  disabled={signing}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-medium hover:bg-brand-500/25 transition-all disabled:opacity-50"
                >
                  {signing ? (
                    <>
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing…
                    </>
                  ) : (
                    "Sign In With Solana"
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <section className="max-w-4xl mx-auto pt-32 pb-24 px-4 space-y-8">
        {/* ===== Step 1: Snapshot ===== */}
        <StepCard
          step={1}
          title="Snapshot Holders"
          subtitle="Enter a Solana token mint address to fetch holders via Helius mainnet."
          active={step === "snapshot"}
          done={snapshotTaken}
        >
          <div className="space-y-4">
            {/* Devnet test token presets */}
            {!snapshotTaken && (
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] text-slate-500 self-center">Try:</span>
                {[
                  { label: "ANSEM", mint: "F23GvgK5TvSA78FmibZot7gtU3yfAiPb4BkD4RrZc18B" },
                  { label: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
                ].map((t) => (
                  <button
                    key={t.mint}
                    onClick={() => setTokenAddress(t.mint)}
                    className="px-2 py-1 rounded-lg bg-surface-800 border border-slate-600/50 text-[11px] text-slate-300 hover:border-brand-500/50 hover:text-brand-300 transition-all font-mono truncate max-w-[220px]"
                    title={t.mint}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Token Mint Address
              </label>
              <input
                className="glass-input font-mono text-sm"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="Paste Solana token mint address..."
              />
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                {error}
              </div>
            )}
            <button
              className="btn-primary w-full"
              onClick={takeSnapshot}
              disabled={snapshotTaken || loading || !tokenAddress.trim()}
            >
              {loading
                ? "Fetching holders from Helius..."
                : snapshotTaken
                ? `✓ Snapshot taken — ${snapshotHolders.length} holders`
                : "Take Snapshot"}
            </button>
          </div>
          {snapshotTaken && snapshotHolders.length === 0 && (
            <div className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm text-center">
              No holders found for this token. The mint may be new or have zero holders.
            </div>
          )}
          {snapshotTaken && (
            <HolderTable holders={snapshotHolders} className="mt-6" />
          )}
        </StepCard>

        {/* ===== Step 2: Collect Rewards ===== */}
        <StepCard
          step={2}
          title="Collect Rewards"
          subtitle="Specify how many reward tokens to collect, plus an optional extra fee."
          active={step === "rewards"}
          done={rewardsCollected}
          disabled={!snapshotTaken || snapshotHolders.length === 0}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Reward Tokens to Collect
              </label>
              <input
                type="number"
                className="glass-input"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Extra Fee (%)
              </label>
              <input
                type="number"
                className="glass-input"
                value={extraFeePercent}
                onChange={(e) =>
                  setExtraFeePercent(
                    Math.min(100, Math.max(0, Number(e.target.value)))
                  )
                }
                min={0}
                max={100}
                step={0.1}
              />
            </div>
          </div>
          <div className="mt-3 p-3 rounded-xl bg-surface-800/60 border border-slate-700/30 text-sm text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Collected</span>
              <span className="text-white font-mono">
                {rewardAmount.toLocaleString()} RFLCT
              </span>
            </div>
            <div className="flex justify-between">
              <span>Fee ({extraFeePercent}%)</span>
              <span className="text-rose-400 font-mono">
                −{(rewardAmount * extraFeePercent) / 100} RFLCT
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-700/40 pt-1">
              <span>After fee</span>
              <span className="text-emerald-400 font-mono font-semibold">
                {afterFee.toLocaleString()} RFLCT
              </span>
            </div>
          </div>
          <button
            className="btn-primary w-full mt-4"
            onClick={collectRewards}
            disabled={rewardsCollected || !snapshotTaken}
          >
            {rewardsCollected ? "✓ Rewards Collected" : "Collect Rewards"}
          </button>
        </StepCard>

        {/* ===== Step 3: Burn ===== */}
        <StepCard
          step={3}
          title="Burn Tokens"
          subtitle="Optionally burn a percentage of the collected rewards before distributing."
          active={step === "burn"}
          done={burnComplete}
          disabled={!rewardsCollected}
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Burn percentage:{" "}
              <span className="text-brand-400 font-bold">{burnPercent}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={25}
              value={burnPercent}
              onChange={(e) => setBurnPercent(Number(e.target.value))}
              className="w-full from-slider"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0%</span>
              <span>12.5%</span>
              <span>25%</span>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-xl bg-surface-800/60 border border-slate-700/30 text-sm text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Available</span>
              <span className="text-white font-mono">
                {afterFee.toLocaleString()} RFLCT
              </span>
            </div>
            <div className="flex justify-between">
              <span>Burned ({burnPercent}%)</span>
              <span className="text-rose-400 font-mono">
                🔥 −{(afterFee * burnPercent) / 100} RFLCT
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-700/40 pt-1">
              <span>To distribute</span>
              <span className="text-emerald-400 font-mono font-semibold">
                {afterBurn.toLocaleString()} RFLCT
              </span>
            </div>
          </div>
          <button
            className="btn-primary w-full mt-4"
            onClick={executeBurn}
            disabled={burnComplete || !rewardsCollected}
          >
            {burnComplete ? "✓ Burn Complete" : "Execute Burn"}
          </button>
        </StepCard>

        {/* ===== Step 4: Distribute ===== */}
        <StepCard
          step={4}
          title="Distribute to Holders"
          subtitle="Use the sliders to exclude the top or bottom holders from this distribution."
          active={step === "distribute"}
          done={distributionDone}
          disabled={!burnComplete || eligibleHolders.length === 0}
        >
          {/* Dual sliders */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Exclude top holders:{" "}
                <span className="text-brand-400 font-bold">{excludeTop}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={50}
                value={excludeTop}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setExcludeTop(v);
                  if (v + excludeBottom > 50) setExcludeBottom(50 - v);
                }}
                className="w-full from-slider"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>All included</span>
                <span>Exclude half</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Exclude bottom holders:{" "}
                <span className="text-purple-400 font-bold">
                  {excludeBottom}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={50}
                value={excludeBottom}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setExcludeBottom(v);
                  if (v + excludeTop > 50) setExcludeTop(50 - v);
                }}
                className="w-full to-slider"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>All included</span>
                <span>Exclude half</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 rounded-xl bg-surface-800/60 border border-slate-700/30 text-sm text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Total holders</span>
              <span className="text-white">{snapshotHolders.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Excluded</span>
              <span className="text-yellow-400">{totalExcluded}</span>
            </div>
            <div className="flex justify-between">
              <span>Eligible</span>
              <span className="text-emerald-400 font-semibold">
                {eligibleHolders.length}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-700/40 pt-1">
              <span>Per-holder pool</span>
              <span className="text-brand-300 font-mono">
                {afterBurn.toLocaleString()} RFLCT
              </span>
            </div>
          </div>

          {/* Distribution preview */}
          {distribution.length > 0 && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-slate-700/30">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-800 text-slate-400">
                  <tr>
                    <th className="text-left py-2 px-3">Holder</th>
                    <th className="text-right py-2 px-3">Share</th>
                    <th className="text-right py-2 px-3">Receives</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.map((h, i) => (
                    <tr
                      key={h.address + i}
                      className={i % 2 === 0 ? "bg-surface-800/30" : ""}
                    >
                      <td className="py-2 px-3 font-mono text-xs text-slate-500">
                        {h.address}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {h.percentage.toFixed(2)}%
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-mono text-xs">
                        {h.receive.toFixed(2)} RFLCT
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className="btn-primary w-full mt-4"
            onClick={executeDistribution}
            disabled={distributionDone || !burnComplete}
          >
            {distributionDone
              ? "✓ Distribution Complete"
              : "Distribute Reflections"}
          </button>
        </StepCard>

        {/* ===== Done ===== */}
        {step === "done" && (
          <div className="glass-card p-8 text-center space-y-5">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl font-bold text-white">
              Reflection Complete!
            </h2>
            <p className="text-slate-400 max-w-md mx-auto">
              {afterBurn.toLocaleString()} RFLCT distributed across{" "}
              {eligibleHolders.length} holders.
              {burnPercent > 0 &&
                ` ${((afterFee * burnPercent) / 100).toLocaleString()} RFLCT burned.`}
              {extraFeePercent > 0 &&
                ` ${((rewardAmount * extraFeePercent) / 100).toLocaleString()} RFLCT collected as fee.`}
            </p>

            {/* Cron / API section */}
            <div className="mt-4 p-4 rounded-xl bg-surface-800/60 border border-slate-700/30 text-left">
              <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
                ⏱️ Schedule this reflection
              </p>
              <p className="text-xs text-slate-500 mb-3">
                Copy this command and hand it to your Hermes agent — it hits the API endpoint
                that re-runs the full snapshot → rewards → burn → distribution on any schedule.
              </p>
              <div className="relative">
                <pre className="bg-surface-950 border border-slate-700/50 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
{`curl -s -X POST https://reflector-panel.vercel.app/api/reflect \\
  -H "Content-Type: application/json" \\
  -d '{
  "mint": "${tokenAddress}",
  "network": "mainnet",
  "rewardAmount": ${rewardAmount},
  "extraFeePercent": ${extraFeePercent},
  "burnPercent": ${burnPercent},
  "excludeTop": ${excludeTop},
  "excludeBottom": ${excludeBottom}
}'`}
                </pre>
                <CopyButton
                  text={`curl -s -X POST https://reflector-panel.vercel.app/api/reflect \\
  -H "Content-Type: application/json" \\
  -d '{
  "mint": "${tokenAddress}",
  "network": "mainnet",
  "rewardAmount": ${rewardAmount},
  "extraFeePercent": ${extraFeePercent},
  "burnPercent": ${burnPercent},
  "excludeTop": ${excludeTop},
  "excludeBottom": ${excludeBottom}
}'`}
                />
              </div>
            </div>

            <button className="btn-secondary" onClick={resetAll}>
              ← Start New Reflection
            </button>
          </div>
        )}
        {/* ===== Auto‑Distribute Panel ===== */}
        <div className="glass-card p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 bg-amber-500/20 text-amber-400">
              ⚡
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Auto-Distribute</h3>
              <p className="text-sm text-slate-400">
                Watches a wallet balance and triggers distribution automatically when the threshold is met.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-surface-800 accent-amber-500"
              />
              <span className="text-sm font-medium text-slate-300">
                {autoEnabled ? "🟢 Auto-distribute enabled" : "⚪ Auto-distribute disabled"}
              </span>
            </label>

            {autoEnabled && (
              <>
                {/* Wallet to monitor */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Monitor Wallet
                  </label>
                  <input
                    className="glass-input font-mono text-sm"
                    value={autoWallet}
                    onChange={(e) => setAutoWallet(e.target.value)}
                    placeholder="Wallet address holding reward tokens…"
                  />
                </div>

                {/* Reward token mint */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Reward Token Mint
                  </label>
                  <input
                    className="glass-input font-mono text-sm"
                    value={autoRewardMint}
                    onChange={(e) => setAutoRewardMint(e.target.value)}
                    placeholder="SPL mint of reward token"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Default: USDC</p>
                </div>

                {/* Threshold */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Threshold ({autoThreshold.toLocaleString()} tokens)
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10000}
                    step={1}
                    value={autoThreshold}
                    onChange={(e) => setAutoThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>1</span><span>5,000</span><span>10,000</span>
                  </div>
                </div>

                {/* Uses current reflection params */}
                <div className="p-3 rounded-xl bg-surface-800/60 border border-slate-700/30 text-xs text-slate-400 space-y-1">
                  <p className="font-medium text-slate-300 mb-1">Distribution params (from current config):</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <span>Target: <code className="text-brand-300">{tokenAddress.slice(0, 8)}…</code></span>
                    <span>Rewards: {rewardAmount.toLocaleString()}</span>
                    <span>Fee: {extraFeePercent}%</span>
                    <span>Burn: {burnPercent}%</span>
                    <span>Exclude top: {excludeTop}%</span>
                    <span>Exclude bottom: {excludeBottom}%</span>
                  </div>
                </div>

                {/* Save button */}
                <button
                  className="btn-primary w-full"
                  onClick={saveAutoConfig}
                  disabled={autoSaving || !autoWallet.trim()}
                >
                  {autoSaving ? "Saving…" : autoSaved ? "✓ Saved!" : "💾 Save Auto-Distribute Config"}
                </button>

                {/* Snippet display */}
                {autoSnippet && (
                  <div className="relative">
                    <p className="text-xs text-slate-500 mb-2">
                      Save this to <code className="text-amber-300">~/.hermes/scripts/auto-reflect-jobs.json</code> and the poller picks it up.
                    </p>
                    <pre className="bg-surface-950 border border-slate-700/50 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                      {autoSnippet}
                    </pre>
                    <CopyButton text={autoSnippet} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function StepsIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "snapshot", label: "Snapshot" },
    { key: "rewards", label: "Rewards" },
    { key: "burn", label: "Burn" },
    { key: "distribute", label: "Distribute" },
    { key: "done", label: "Done" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);
  return (
    <div className="hidden sm:flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div
            className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
              i === currentIdx
                ? "bg-brand-600/30 text-brand-300"
                : i < currentIdx
                ? "bg-emerald-600/20 text-emerald-400"
                : "bg-transparent text-slate-600"
            }`}
          >
            {i < currentIdx ? "✓" : ""} {s.label}
          </div>
          {i < steps.length - 1 && <div className="w-3 h-px bg-slate-700" />}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  step: stepNum,
  title,
  subtitle,
  active,
  done,
  disabled,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`glass-card p-6 transition-all duration-300 ${
        disabled ? "opacity-40 pointer-events-none" : ""
      } ${active ? "ring-2 ring-brand-500/40 shadow-brand-500/10" : ""}`}
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 transition-all ${
            done
              ? "bg-emerald-500/20 text-emerald-400"
              : active
              ? "bg-brand-500/20 text-brand-400"
              : "bg-surface-800 text-slate-600"
          }`}
        >
          {done ? "✓" : stepNum}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function HolderTable({
  holders,
  className,
}: {
  holders: Holder[];
  className?: string;
}) {
  return (
    <div className={`${className ?? ""}`}>
      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-700/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-800 text-slate-400">
            <tr>
              <th className="text-left py-2 px-3">Holder</th>
              <th className="text-right py-2 px-3">Balance</th>
              <th className="text-right py-2 px-3">%</th>
            </tr>
          </thead>
          <tbody>
            {holders.map((h, i) => (
              <tr
                key={h.address + i}
                className={i % 2 === 0 ? "bg-surface-800/30" : ""}
              >
                <td className="py-2 px-3 font-mono text-xs text-slate-500">
                  {h.address}
                </td>
                <td className="py-2 px-3 text-right text-slate-300">
                  {h.balance.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right text-slate-400">
                  {h.percentage}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-brand-600/30 border border-brand-500/30 text-brand-300 text-[11px] font-medium hover:bg-brand-600/50 transition-all"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
