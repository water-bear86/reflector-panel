import Head from "next/head";
import type { ReactNode } from "react";

interface Section {
  id: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "overview", title: "Overview" },
  { id: "non-custodial", title: "Non-custodial by design" },
  { id: "building", title: "Building a pipeline" },
  { id: "reach-modes", title: "Holder reach modes" },
  { id: "threshold", title: "Drop threshold & interval" },
  { id: "validate", title: "Validate & permanence" },
  { id: "activate", title: "Activating on Pump.fun" },
  { id: "fee", title: "Platform fee" },
  { id: "faq", title: "FAQ" },
];

function Toc() {
  return (
    <nav className="space-y-0.5">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="block px-2.5 py-1.5 rounded-none text-xs text-slate-400 hover:text-pink-300 hover:bg-white/[0.04] transition-colors"
        >
          {s.title}
        </a>
      ))}
    </nav>
  );
}

function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 glass-card p-6 space-y-3">
      <h2 className="text-lg font-bold text-pink-300 tracking-wide">{title}</h2>
      <div className="text-sm text-slate-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Docs() {
  return (
    <>
      <Head>
        <title>Docs — Wen Stimmy</title>
      </Head>
      <main className="relative min-h-screen bg-gradient-to-br from-surface-900 via-surface-900 to-pink-900/40">
        <header className="fixed top-0 inset-x-0 z-50 glass-card rounded-none border-b border-slate-700/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
            <a href="/" className="text-lg font-bold text-white tracking-tight">
              wen stimmy <span className="text-pink-300 font-normal text-sm">/ docs</span>
            </a>
            <a href="/#create" className="btn-secondary text-xs !py-1.5 !px-4">
              ← Back to app
            </a>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 pt-28 pb-20">
          <div className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">How Wen Stimmy works</h1>
            <p className="mt-2 text-slate-400 text-sm max-w-2xl">
              Everything the app does, in one place — what happens to your creator fees, what you control, and what's
              permanent once you commit.
            </p>
          </div>

          <div className="grid lg:grid-cols-[200px_1fr] gap-8 items-start">
            <div className="hidden lg:block sticky top-28 hud-panel !p-3">
              <Toc />
            </div>

            <div className="space-y-5">
              <DocSection id="overview" title="Overview">
                <p>
                  Wen Stimmy automates Pump.fun creator-fee routing. Instead of manually claiming fees and deciding
                  what to do with them, you set up a <strong className="text-white">pipeline</strong> once: it
                  collects your token's creator fees on a schedule and automatically splits them across rules you
                  define — airdrop to holders, buy back and burn, or send to a wallet.
                </p>
              </DocSection>

              <DocSection id="non-custodial" title="Non-custodial by design">
                <p>
                  Creating a pipeline generates a fresh Solana wallet dedicated to it. You then set that wallet as
                  your token's <strong className="text-white">sole Pump.fun fee receiver</strong>. Your own private
                  key never touches this app — the panel only ever holds the keypair for the wallet it generated,
                  encrypted at rest, and only that wallet ever collects or spends the fees.
                </p>
                <p>
                  The permissionless <code className="glass-input inline font-mono text-xs px-1.5 py-0.5 w-auto">distributeCreatorFees</code>{" "}
                  crank is what actually pulls fees into the pipeline wallet — anyone can call it, so nothing is
                  waiting on this app being online for fees to be collectible.
                </p>
              </DocSection>

              <DocSection id="building" title="Building a pipeline">
                <p>Every pipeline needs two things: a token, and at least one rule.</p>
                <ul className="list-disc list-inside space-y-1.5 marker:text-pink-400">
                  <li><strong className="text-white">Your token</strong> — the Pump.fun mint whose creator fees this pipeline collects.</li>
                  <li>
                    <strong className="text-white">Rules</strong> — what happens to the collected SOL. Add as many as
                    you like; their percentages must add up to 100%:
                    <ul className="list-[circle] list-inside ml-4 mt-1 space-y-1">
                      <li><strong className="text-slate-200">Airdrop to holders</strong> — swap the SOL into a token and distribute it to holders of another token (or your own).</li>
                      <li><strong className="text-slate-200">Buy back &amp; burn</strong> — swap the SOL into a token and burn it forever.</li>
                      <li><strong className="text-slate-200">Send to a wallet</strong> — route the SOL straight to a wallet you choose.</li>
                    </ul>
                  </li>
                </ul>
              </DocSection>

              <DocSection id="reach-modes" title="Holder reach modes">
                <p>
                  Airdrop rules pick recipients by lottery among a token's holders, then split the swapped amount{" "}
                  <strong className="text-white">equally</strong> — never weighted by balance. A lower recipient cap
                  means a bigger share each; a higher cap means broader reach. Three modes control that cap:
                </p>
                <div className="grid sm:grid-cols-3 gap-2 pt-1">
                  <div className="glass-input !bg-surface-900/60 space-y-1">
                    <div className="font-bold text-pink-200">Bless</div>
                    <div className="text-xs text-slate-400">Up to 10 holders — big drops each</div>
                  </div>
                  <div className="glass-input !bg-surface-900/60 space-y-1">
                    <div className="font-bold text-pink-200">@Here</div>
                    <div className="text-xs text-slate-400">Up to 122 holders — a thicker spread</div>
                  </div>
                  <div className="glass-input !bg-surface-900/60 space-y-1">
                    <div className="font-bold text-pink-200">Spam</div>
                    <div className="text-xs text-slate-400">Up to 245 holders — max reach per buy</div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  If the pool of SOL ends up bigger than usual (fees piled up over a few cycles), the cap scales up
                  proportionally so the surplus reaches more holders instead of just paying the same audience more.
                </p>
              </DocSection>

              <DocSection id="threshold" title="Drop threshold & check interval">
                <p>
                  Fees accumulate in the pipeline wallet until spendable SOL clears your{" "}
                  <strong className="text-white">drop threshold</strong> (0.5 SOL by default) — then a round fires
                  automatically. The wallet always keeps a small reserve (0.02 SOL) for its own transaction fees,
                  which is never spent by your rules.
                </p>
                <p>
                  You also pick how often the pipeline checks for collectible fees, from three presets:
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="glass-input !bg-surface-900/60 space-y-0.5"><div className="font-bold text-pink-200">Spam</div><div className="text-[11px] text-slate-400">every 2:30</div></div>
                  <div className="glass-input !bg-surface-900/60 space-y-0.5"><div className="font-bold text-pink-200">Middle Bun</div><div className="text-[11px] text-slate-400">every 5 min</div></div>
                  <div className="glass-input !bg-surface-900/60 space-y-0.5"><div className="font-bold text-pink-200">Low</div><div className="text-[11px] text-slate-400">every 10 min</div></div>
                </div>
                <p className="text-xs text-slate-500">
                  Whichever preset you pick, the pipeline only ever actually distributes when Pump.fun's own
                  minimum-distributable-fee check passes — a fast check interval just means catching that moment
                  sooner, not spending anything extra on a quiet token.
                </p>
              </DocSection>

              <DocSection id="validate" title="Validate & permanence">
                <p>
                  Before you can create a pipeline, you must press <strong className="text-white">VALIDATE</strong>.
                  It runs the exact same checks the create step will, plus a live on-chain lookup of every token
                  you've referenced, and shows the precise workflow that will be created — fee source, drop
                  threshold, and one plain-English line per rule.
                </p>
                <p className="text-pink-200/90">
                  This matters because pipelines are permanent once created — there is no edit screen. Validating is
                  your one real chance to catch a mistake before it's locked in.
                </p>
              </DocSection>

              <DocSection id="activate" title="Activating on Pump.fun">
                <p>
                  Creating a pipeline generates its wallet but leaves it paused. Set that wallet as your token's fee
                  receiver on Pump.fun, then come back and press <strong className="text-white">Activate</strong> —
                  the app verifies on-chain that the wallet is genuinely entitled to the token's fees before turning
                  the pipeline on. Nothing runs until that check passes.
                </p>
              </DocSection>

              <DocSection id="fee" title="Platform fee">
                <p>
                  A flat 1.5% platform fee is taken off the top of each round before your own rules run. It's the
                  only cut the app takes — everything else you configure goes exactly where you told it to.
                </p>
              </DocSection>

              <DocSection id="faq" title="FAQ">
                <div className="space-y-4">
                  <div>
                    <p className="text-white font-semibold">Can I edit a pipeline after creating it?</p>
                    <p>No. There's no edit endpoint — VALIDATE exists precisely because creation is final.</p>
                  </div>
                  <div>
                    <p className="text-white font-semibold">Is my own private key ever exposed to this app?</p>
                    <p>No. The app only ever generates and holds its own pipeline wallets, never your personal key.</p>
                  </div>
                  <div>
                    <p className="text-white font-semibold">How often does it check for fees?</p>
                    <p>Whatever preset you picked at creation — Spam (2:30), Middle Bun (5 min), or Low (10 min) — see "Drop threshold &amp; interval" above.</p>
                  </div>
                  <div>
                    <p className="text-white font-semibold">What if I want to stop a pipeline?</p>
                    <p>Reach out — pipelines can be disabled so they stop being checked and never spend again.</p>
                  </div>
                </div>
              </DocSection>
            </div>
          </div>
        </div>

        <footer className="relative border-t border-slate-800/60">
          <div className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">← Back to the app</a>
          </div>
        </footer>
      </main>
    </>
  );
}
